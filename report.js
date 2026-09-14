import lib from 'lib'
import helper from './helper.js'
import worker from './worker.bundle.js';
import { program } from 'commander'
import dotenv from 'dotenv';
dotenv.config({ path: '/root/.brook_store.env' })

program
    .name('brook_store_report')
    .description('auto')
    .option('--serverport <int>', '', '')
    .option('--wsserverport <int>', '', '')
    .option('--password <string>', '', '')
program.parse();
const options = program.opts();

var j = JSON.parse(await lib.sh(`curl -4 https://ifconfig.co/json`))
var ip4 = j.ip
var country_iso = j.country_iso
var country = j.country

var j = JSON.parse(await lib.sh(`curl -6 https://ifconfig.co/json`))
var ip6 = j.ip

lib.go(new TextDecoder().decode(worker("worker/report_worker.js")), { ip4, ip6 })

var link_server_4 = new URL("brook://server")
link_server_4.searchParams.set('server', `${ip4}:${options.serverport}`)
link_server_4.searchParams.set('password', options.password)
link_server_4.searchParams.set('udpovertcp', 'true')
link_server_4.searchParams.set('country', country_iso)
link_server_4.searchParams.set('name', `${country} server IPv4`)
var link_server_4s = link_server_4.toString()
link_server_4.searchParams.set('token', process.env.brook_store_reporter_user_token)
var link_server_4t = link_server_4.toString()

var link_server_6 = new URL("brook://server")
link_server_6.searchParams.set('server', `[${ip6}]:${options.serverport}`)
link_server_6.searchParams.set('password', options.password)
link_server_6.searchParams.set('udpovertcp', 'true')
link_server_6.searchParams.set('country', country_iso)
link_server_6.searchParams.set('name', `${country} server IPv6`)
var link_server_6s = link_server_6.toString()
link_server_6.searchParams.set('token', process.env.brook_store_reporter_user_token)
var link_server_6t = link_server_6.toString()

var link_wsserver_4 = new URL("brook://wsserver")
link_wsserver_4.searchParams.set('wsserver', `ws://${ip4}:${options.wsserverport}`)
link_wsserver_4.searchParams.set('password', options.password)
link_wsserver_4.searchParams.set('country', country_iso)
link_wsserver_4.searchParams.set('name', `${country} wsserver IPv4`)
var link_wsserver_4s = link_wsserver_4.toString()
link_wsserver_4.searchParams.set('token', process.env.brook_store_reporter_user_token)
var link_wsserver_4t = link_wsserver_4.toString()

var link_wsserver_6 = new URL("brook://wsserver")
link_wsserver_6.searchParams.set('wsserver', `ws://[${ip6}]:${options.wsserverport}`)
link_wsserver_6.searchParams.set('password', options.password)
link_wsserver_6.searchParams.set('country', country_iso)
link_wsserver_6.searchParams.set('name', `${country} wsserver IPv6`)
var link_wsserver_6s = link_wsserver_6.toString()
link_wsserver_6.searchParams.set('token', process.env.brook_store_reporter_user_token)
var link_wsserver_6t = link_wsserver_6.toString()

for (; ;) {
    try {
        var c = parseInt((await lib.sh(`ss -s | head -1 | awk '{print $2}'`)).trim())

        var s = await lib.sh(`brook testbrook -l '${link_server_4t}'`)
        if (s.split("OK").length != 3) throw s
        var res = await fetch(`https://${process.env.brook_store_domain}/api/${process.env.brook_store_secret}/report-server`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                brooklink: link_server_4s,
                connectionnumber: c,
            }),
            signal: AbortSignal.timeout(30 * 1000),
        })
        if (res.status != 200) throw await res.text()

        var s = await lib.sh(`brook testbrook -l '${link_server_6t}'`)
        if (s.split("OK").length != 3) throw s
        var res = await fetch(`https://${process.env.brook_store_domain}/api/${process.env.brook_store_secret}/report-server`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                brooklink: link_server_6s,
                connectionnumber: c,
            }),
            signal: AbortSignal.timeout(30 * 1000),
        })
        if (res.status != 200) throw await res.text()

        var s = await lib.sh(`brook testbrook -l '${link_wsserver_4t}'`)
        if (s.split("OK").length != 3) throw s
        var res = await fetch(`https://${process.env.brook_store_domain}/api/${process.env.brook_store_secret}/report-server`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                brooklink: link_wsserver_4s,
                connectionnumber: c,
            }),
            signal: AbortSignal.timeout(30 * 1000),
        })
        if (res.status != 200) throw await res.text()

        var s = await lib.sh(`brook testbrook -l '${link_wsserver_6t}'`)
        if (s.split("OK").length != 3) throw s
        var res = await fetch(`https://${process.env.brook_store_domain}/api/${process.env.brook_store_secret}/report-server`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                brooklink: link_wsserver_6s,
                connectionnumber: c,
            }),
            signal: AbortSignal.timeout(30 * 1000),
        })
        if (res.status != 200) throw await res.text()
    } catch (e) {
        await helper.hi({
            which: 'brook_store',
            ip4, ip6,
            error: e.toString(),
        })
    }
    await Bun.sleep(60 * 1000)
}
