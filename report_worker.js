import helper from './helper.js'

self.onmessage = async (event) => {
    Bun.cron("0 0 * * *", async () => {
        try {
            var ut = {}
            var f = Bun.file("/server.log");
            var s = (await f.text()).trim()
            if (s) {
                var l = s.split("\n");
                for (var i = 0; i < l.length; i++) {
                    var j = JSON.parse(l[i])
                    if (!j.user) continue
                    j.user = parseInt(j.user)
                    j.bytes = parseInt(j.bytes)
                    if (!ut[j.user]) ut[j.user] = 0
                    ut[j.user] += j.bytes
                }
            }
            var f = Bun.file("/wsserver.log");
            var s = (await f.text()).trim()
            if (s) {
                var l = s.split("\n");
                for (var i = 0; i < l.length; i++) {
                    var j = JSON.parse(l[i])
                    if (!j.user) continue
                    j.user = parseInt(j.user)
                    j.bytes = parseInt(j.bytes)
                    if (!ut[j.user]) ut[j.user] = 0
                    ut[j.user] += j.bytes
                }
            }

            var it = []
            for (const [k, v] of Object.entries(ut)) {
                it.push({ id: k, traffic: v })
            }
            if (!it.length) return
            var res = await fetch(`https://${process.env.brook_store_domain}/api/${process.env.brook_store_secret}/report-traffic`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(it),
                signal: AbortSignal.timeout(30 * 1000)
            })
            if (res.status != 200) throw await res.text()

            var f = Bun.file("/server.pid");
            var pid = parseInt((await f.text()).trim())
            process.kill(pid, "SIGUSR1");
            var f = Bun.file("/wsserver.pid");
            var pid = parseInt((await f.text()).trim())
            process.kill(pid, "SIGUSR1");
        } catch (e) {
            await helper.hi({
                which: 'brook_store',
                when: 'cli report worker',
                error: e.toString(),
                ip4: event.data.ip4,
                ip6: event.data.ip6,
            })
        }
    });
}
