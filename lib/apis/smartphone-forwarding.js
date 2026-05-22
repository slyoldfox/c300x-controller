const openwebnet = require('../openwebnet')

const STATES = {
    0: 'enabled',
    1: 'in-house-only',
    2: 'blocked',
}

function parseMode(result) {
    const match = result?.match(/\*#8\*\*37\*([012])##/)
    return match ? Number(match[1]) : undefined
}

function actionFromQuery(q) {
    if (q.enable === 'true' || q.state === 'enabled' || q.state === 'enable') {
        return 'smartphoneForwardingEnable'
    }
    if (q.enable === 'false' || q.block === 'true' || q.state === 'blocked' || q.state === 'block') {
        return 'smartphoneForwardingBlock'
    }
    return 'smartphoneForwardingStatus'
}

module.exports = class Api {
    path() {
        return '/smartphone-forwarding'
    }

    description() {
        return 'Enables/disables smartphone call forwarding'
    }

    handle(request, response, url, q) {
        if (q.raw === 'true') {
            response.setHeader('Content-Type', 'application/json; charset=utf-8')
            const action = actionFromQuery(q)
            openwebnet.run(action)
                .then((result) => {
                    const mode = parseMode(result)
                    response.end(JSON.stringify({
                        mode,
                        state: STATES[mode] || 'unknown',
                        raw: result,
                    }))
                })
                .catch((e) => {
                    response.statusCode = 500
                    response.end(JSON.stringify({ error: e?.message || String(e) }))
                })
            return
        }

        response.write('<pre>')
        response.write("<a href='./smartphone-forwarding?enable=true'>Enable all smartphone forwarding</a><br/>")
        response.write("<a href='./smartphone-forwarding?enable=false'>Block all smartphone forwarding</a><br/>")
        response.write("<a href='./smartphone-forwarding?raw=true'>Raw status</a>")
        response.write('</pre>')

        const action = actionFromQuery(q)
        if (action !== 'smartphoneForwardingStatus') {
            openwebnet.run(action).catch((e) => console.error(e))
        }
    }
}
