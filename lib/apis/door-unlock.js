const fs = require('fs')
const openwebnet = require('../openwebnet.js')

module.exports = class Api {

    get config() {
        return {
            ... {
                doorUnlock: {
                    openSequence: '*8*19*20##',
                    closeSequence: '*8*20*20##',
                }
            },
            ... (fs.existsSync('../../config.js') ? require('../../config.js') : {}),
        }.doorUnlock;
    }

    path() {
        return "/unlock"
    }

    description() {
        return "Unlocks the door"
    }

    handle(request, response) {
        openwebnet.run("doorUnlock", this.config.openSequence, this.config.closeSequence)

        response.writeHead(200, { "Content-Type": "text/plain" });
        response.write("DONE\n")
    }
}
