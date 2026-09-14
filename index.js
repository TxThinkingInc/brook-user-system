import helper from './helper.js'
import migration from './migration.js'
import { RateLimiterMemory } from "rate-limiter-flexible"
import lib from 'lib'
import { RedisClient } from "bun";
import dotenv from 'dotenv';
import html_index from "./index.html" with { type: "file" }
import nodemailer from "nodemailer"
import server_tengo_file from './server.tengo' with {type: "file"}

dotenv.config({ path: '/root/.brook_store.env' })
helper.limits_raise()
var db = await helper.mysql(process.env.brook_store_mysql_host ?? '127.0.0.1', process.env.brook_store_mysql_port ?? 3306, process.env.brook_store_mysql_user ?? 'root', process.env.brook_store_mysql_password ?? "111111", "brook_store")
const rds = new RedisClient(`redis://${process.env.brook_store_redis_host ?? '127.0.0.1'}:${process.env.brook_store_redis_port ?? '6379'}/${process.env.brook_store_redis_db ?? '5'}`);
const resend = nodemailer.createTransport({
    host: process.env.brook_store_smtp_host,
    port: process.env.brook_store_smtp_port,
    auth: {
        user: process.env.brook_store_smtp_user,
        pass: process.env.brook_store_smtp_pass,
    }
});
await migration(db)
const rl_send_code = new RateLimiterMemory({ points: 10, duration: 60 })
const rl_code = new RateLimiterMemory({ points: 5, duration: 300 })
var server_tengo = await Bun.file(server_tengo_file).text()

Bun.cron("0 0 1 * *", async () => {
    try {
        await rds.send('flushdb', [])
    } catch (e) {
        await helper.hi({
            which: 'brook_store',
            when: 'redis flush db',
            error: e.toString(),
        })
    }
});

async function door(token) {
    var [id, _] = await helper.token_decrypt(process.env.brook_store_secret, 'u', token)
    var rows = await db`SELECT * FROM user WHERE id = ${id} limit 1`;
    if (!rows.length) throw 'hacking'
    var u = rows[0]
    if (u.expiredat == -1) throw 'account blocked'
    return u
}

async function handle(req, server) {
    var ip = helper.get_client_ip(req, server)
    var query = Object.fromEntries(new URL(req.url).searchParams);
    var p = new URL(req.url).pathname;
    var data = null
    if (req.headers.get('Content-Type') == 'application/json') {
        data = await req.json()
    }
    if (p == "/") {
        let html = await Bun.file(html_index).text()
        let config = {
            name_zh: process.env.brook_store_name_zh,
            name_en: process.env.brook_store_name_en,
            support: process.env.brook_store_support,
        }
        html = html.replace('<head>', `<head>\n    <script>window.APP_CONFIG = ${JSON.stringify(config)}</script>`)
        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }
    if (p == "/api/payment") {
        var u = await door(data.token)
        var link = (process.env.brook_store_payment_link || '').replace('USER_ID', u.id)
        return new Response(JSON.stringify({ link }), { headers: { 'Content-Type': 'application/json' } })
    }
    if (p == "/api/user") {
        var u = await door(query.token)
        var r = await rds.send('zscore', ['user_traffic', u.id])
        r = r ? r : 0
        var rewards = await db`SELECT createdat FROM payment WHERE promoter_user_id = ${u.id} AND status = 2 ORDER BY id DESC`;
        return new Response(JSON.stringify({
            id: u.id,
            email: u.email,
            expiredat: u.expiredat,
            traffic: Math.trunc(r / 1024 / 1024),
            promocode: (u.id * 9999).toString(16),
            rewards: rewards,
        }), { headers: { 'Content-Type': 'application/json' } })
    }
    if (p == "/api/signin-send-code") {
        data.email = data.email.toLowerCase()
        try {
            await rl_send_code.consume(ip)
            await rl_send_code.consume(data.email)
        } catch (e) {
            throw 'Too many requests, please try again later.'
        }
        var code = Math.floor(Math.random() * 1000) + 1000
        await resend.sendMail({
            from: process.env.brook_store_smtp_from,
            to: data.email,
            subject: `${code} is your verification code`,
            text: `${code} is your verification code.\nThis code is valid for 5 minutes.`,
        })
        var codetoken = await helper.token_encrypt(process.env.brook_store_secret, `codetoken:${data.email}`, `${code}`)
        var r = { codetoken }
        return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json' } })
    }
    if (p == "/api/signin") {
        data.email = data.email.toLowerCase()
        try {
            await rl_code.consume(data.codetoken)
        } catch (e) {
            throw 'The code has expired. Please obtain a new one.'
        }
        var [s, t] = await helper.token_decrypt(process.env.brook_store_secret, `codetoken:${data.email}`, data.codetoken)
        if (Math.abs(lib.now() - t) > 5 * 60) throw 'The code has expired. Please obtain a new one.'
        if (s != data.code) throw 'The code was entered incorrectly. Please check if you have received the latest code.'
        var id = 0
        var rows = await db`SELECT * FROM user WHERE email = ${data.email} limit 1`;
        if (rows.length) {
            id = rows[0].id
        }
        if (!rows.length) {
            var u = {
                email: data.email,
                expiredat: lib.now(),
                createdat: lib.now(),
            }
            if (data.promoter_code) {
                const parsed = parseInt(data.promoter_code, 16) / 9999;
                if (isNaN(parsed) || !Number.isInteger(parsed)) {
                    throw 'Invalid invite code format.'
                }
                var rows = await db`SELECT id FROM user WHERE id = ${parsed}`;
                if (!rows.length) throw 'Invalid promote code'
                u.promoter_user_id = parsed
            }
            var r = await db`insert into user ${db(u)}`
            id = r.lastInsertRowid
        }
        var token = await helper.token_encrypt(process.env.brook_store_secret, 'u', `${id}`)
        var r = { token }
        return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json' } })
    }
    if (p == "/api/servers") {
        var u = await door(query.token)
        if (u.expiredat < lib.now()) throw 'Your account has expired.'
        var rows = await db`SELECT * FROM server WHERE reportedat > ${lib.now() - 3 * 60} order by connectionnumber asc limit 40`;
        rows.sort((a, b) => b.id - a.id);
        var l = rows.map(v => {
            v.brooklink += `&token=${query.token}`
            const url = new URL(v.brooklink);
            url.searchParams.set('name', `${url.searchParams.get('name')} ${v.id}`);
            return url.toString()
        })
        return new Response(l.join('\n'))
    }
    if (p == `/api/${process.env.brook_store_secret}/report-server`) {
        const hasher = new Bun.CryptoHasher("sha256");
        hasher.update(data.brooklink);
        var hash = hasher.digest("hex");
        var rows = await db`SELECT * FROM server WHERE hash = ${hash} limit 1`;
        if (!rows.length) {
            var s = {
                hash: hash,
                brooklink: data.brooklink,
                connectionnumber: data.connectionnumber,
                reportedat: lib.now(),
                createdat: lib.now(),
            }
            await db`insert into server ${db(s)}`
        }
        if (rows.length) {
            var s = rows[0]
            s.connectionnumber = data.connectionnumber
            s.reportedat = lib.now()
            await db`UPDATE server SET ${db(s, "connectionnumber", "reportedat")} WHERE id = ${s.id}`;
        }
        return new Response()
    }
    if (p == `/api/${process.env.brook_store_secret}/report-traffic`) {
        for (var i = 0; i < data.length; i++) {
            var v = data[i]
            await rds.send('zincrby', ['user_traffic', v.traffic, v.id]);
        }
        return new Response()
    }
    if (p == `/api/${process.env.brook_store_secret}/brook-user-api`) {
        var u = await door(query.token)
        if (u.expiredat < lib.now()) {
            throw `:user ${u.id} expired`
        }
        return new Response(u.id)
    }
    if (p == `/api/${process.env.brook_store_secret}/server.tengo`) {
        return new Response(server_tengo)
    }
    if (p == `/api/${process.env.brook_store_secret}/payment-webhook`) {
        var rows = await db`SELECT * FROM user WHERE id = ${query.user_id} limit 1`;
        var user = rows[0]
        var p = {
            user_id: query.user_id,
            method: 'payment',
            transactionid: '',
            product: query.product,
            amount: 1000,
            status: 2,
            updatedat: lib.now(),
            createdat: lib.now(),
            promoter_user_id: user.promoter_user_id,
        }
        if (user.expiredat < lib.now()) user.expiredat = lib.now()
        user.expiredat += 3 * 30 * 24 * 60 * 60
        var puser = null
        if (user.promoter_user_id) {
            var rows = await db`SELECT * FROM user WHERE id = ${user.promoter_user_id} limit 1`;
            puser = rows[0]
            if (puser.expiredat < lib.now()) puser.expiredat = lib.now()
            puser.expiredat += 10 * 24 * 60 * 60
        }
        await db.begin(async tx => {
            await tx`insert into payment ${db(p)}`
            await tx`UPDATE user SET ${db(user, "expiredat")} WHERE id = ${user.id}`;
            if (puser) {
                await tx`UPDATE user SET ${db(puser, "expiredat")} WHERE id = ${puser.id}`;
            }
        });
        return new Response()
    }
    throw 'unknown request'
}

Bun.serve({
    development: false,
    port: process.env.dev ? 8080 : 2609,
    idleTimeout: 255,
    maxRequestBodySize: 1 * 1024 * 1024,
    routes: {
        "/*": async (req, server) => {
            try {
                var res = new Response()
                if (req.method != "OPTIONS") {
                    res = await handle(req, server)
                }
                return helper.cors(req, res)
            } catch (e) {
                if (true &&
                    e.toString().indexOf('unknown request') == -1 &&
                    e.toString().indexOf('system time is wrong') == -1 &&
                    e.toString().indexOf(':user') == -1 &&
                    e.toString().indexOf('The code was entered incorrectly') == -1 &&
                    e.toString().indexOf('Your account has expired') == -1 &&
                    e.toString().indexOf('TypeError: null is not an object') == -1 &&
                    e.toString().indexOf('Unexpected end of JSON input') == -1 &&
                    true) {
                    await helper.hi({
                        which: 'brook_store',
                        url: new URL(req.url).toString(),
                        e: e.toString(),
                        sip: server.requestIP(req).address,
                        xip: req.headers.get('X-Forwarded-For'),
                    })
                }
                var res = new Response(e.toString(), { status: 400 });
                return helper.cors(req, res)
            }
        },
    },
});
