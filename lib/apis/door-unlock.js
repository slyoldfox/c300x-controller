const openwebnet = require('../openwebnet')
const config = require('../../config')

module.exports = class Api {
    path() {
        return "/unlock"
    }

    description() {
        return "Unlocks the door"
    }

    handle(request, response, url, q) {
        response.write("<pre>")
        if (config.locks) {
            for (const lockKey in config.locks) {
                const lock = config.locks[lockKey]
                const displayName = lock.name || lockKey
                response.write("<a href='./unlock?id=" + lockKey + "'>" + displayName + "</a><br/>")
            }
        }
        response.write("</pre>")
        if (q.id) {
            const lock = config.locks[q.id]
            if (lock) {
                openwebnet.run("doorUnlock", lock.openSequence, lock.closeSequence)
                response.write("Opened lock: " + (lock.name || q.id) + "<br/>")
            } else {
                console.error("Lock with id: " + q.id + " not found.")
            }
        }
    }
}
