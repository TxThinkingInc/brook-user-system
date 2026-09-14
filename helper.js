import { SQL } from "bun";
import ip6 from "ip6"
import zhi from 'zhi';
import { dlopen, ptr, FFIType } from "bun:ffi";
import lib from 'lib'

export default {
    mysql: async function(host, port, user, password, database) {
        var db = new SQL({
            adapter: "mysql",
            hostname: host,
            port: port,
            username: user,
            password: password,
            max: 10,
            maxLifetime: 50 * 60,
            idleTimeout: 30,
            connectionTimeout: 30,
        })
        var rows = await db`show databases`
        if (!rows.find(v => v.Database == database)) {
            await db.unsafe(`CREATE DATABASE ${database}`)
        }
        await db.close()
        var db = new SQL({
            adapter: "mysql",
            hostname: host,
            port: port,
            database: database,
            username: user,
            password: password,
            max: 10,
            maxLifetime: 50 * 60,
            idleTimeout: 30,
            connectionTimeout: 30,
        })
        var rows = await db`show tables like 'migration'`
        if (!rows.length) {
            await db`
CREATE TABLE migration (
    id varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
    UNIQUE KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `
        }
        return db
    },
    migrate: async function(db, id, sql) {
        var rows = await db`select * from migration where id=${id}`
        if (!rows.length) {
            const conn = await db.reserve();
            try {
                await conn.begin(async tx => {
                    await tx.unsafe(sql)
                    await tx`insert into migration(id) values(${id})`
                });
            } catch (err) {
                throw err
            } finally {
                await conn.release();
            }
        }
    },
    get_client_ip: function(req, server) {
        var ip = server.requestIP(req).address
        try {
            var ip = req.headers.get('X-Forwarded-For').split(',').pop()
            if (ip.indexOf(':') != -1) {
                ip = ip6.normalize(ip).split(':').slice(0, 4).join(':')
            }
        } catch (e) {
        }
        return ip
    },
    cors: function(req, res) {
        var l = [`https://${process.env.brook_store_domain}`]
        if (req.headers.get("Origin") && l.indexOf(req.headers.get("Origin")) != -1) {
            res.headers.set("Access-Control-Allow-Origin", req.headers.get("Origin"));
            res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, HEAD, PATCH");
            if (req.headers.get("Access-Control-Request-Headers")) {
                res.headers.set("Access-Control-Allow-Headers", req.headers.get("Access-Control-Request-Headers"));
            }
            res.headers.set("Access-Control-Max-Age", 24 * 60 * 60);
        }
        return res;
    },
    hi: async function(o) {
        try {
            var bot = await zhi.Bot.init(process.env.brook_store_zhi_bot_token, [
                {
                    ChatUUID: process.env.brook_store_zhi_ChatUUID,
                    Key: process.env.brook_store_zhi_Key,
                    UserUUID: process.env.brook_store_zhi_UserUUID,
                    Name: process.env.brook_store_zhi_Name,
                    AvatarUUID: process.env.brook_store_zhi_AvatarUUID,
                },
            ])
            await bot.connect()
            var s = o
            if (typeof o != 'string') {
                s = '```\n' + JSON.stringify(o, null, 2) + '\n```'
            }
            await bot.send_markdown(process.env.brook_store_zhi_ChatUUID, s)
            bot.close()
        } catch (e) {
            console.log('hi', o, e)
        }
    },
    token_encrypt: async function(password, k, v) {
        v = new TextEncoder().encode(v)
        var b = new Uint8Array(12 + 4 + v.length + 16)
        crypto.getRandomValues(b.subarray(0, 12));
        new DataView(b.buffer).setUint32(12, parseInt(Date.now() / 1000))
        b.set(v, 12 + 4)
        var key = await crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt: b.subarray(0, 12), info: new TextEncoder().encode(k) },
            await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'HKDF', false, ['deriveKey']),
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt']
        );
        var ab = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: b.subarray(0, 12) },
            key,
            b.slice(12, b.length - 16)
        );
        b.set(new Uint8Array(ab), 12)
        return b.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
    },
    token_decrypt: async function(password, k, c) {
        var b = Uint8Array.from(c.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
        if (b.length < 12 + 4 + 16) {
            throw 'encrypted data too short'
        }
        var key = await crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt: b.subarray(0, 12), info: new TextEncoder().encode(k) },
            await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'HKDF', false, ['deriveKey']),
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );
        var ab = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: b.subarray(0, 12) },
            key,
            b.subarray(12)
        );
        return [new TextDecoder().decode(ab.slice(4)), new DataView(ab.slice(0, 4)).getUint32(0, false)]
    },
    limits_raise: function() {
        const { symbols } = dlopen("libc.so.6", {
            setrlimit: {
                args: [FFIType.i32, FFIType.ptr],
                returns: FFIType.i32,
            },
        });
        const RLIMIT_NOFILE = 7;
        const buffer = new ArrayBuffer(16);
        const view = new DataView(buffer);
        view.setBigUint64(0, 65535n, true);
        view.setBigUint64(8, 65535n, true);
        const setResult = symbols.setrlimit(RLIMIT_NOFILE, ptr(buffer));
        if (setResult !== 0) {
            throw `setrlimit failed code: ${setResult}`
        }
    },
    go: function(worker_path, args) {
        return new Promise((resolve, reject) => {
            var worker = new Worker(worker_path);
            worker.postMessage(args);
            worker.onmessage = event => {
                worker.terminate();
                resolve(event.data)
            };
        });
    },
}
