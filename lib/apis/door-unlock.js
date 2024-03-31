const fs = require('fs')
const openwebnet = require('../openwebnet.js')

module.exports = class Api {
    get config() {
        return {
            ... {
                doorUnlock: {
                    openSequence: '*8*19*20##',
                    closeSequence: '*8*20*20##',
                },
                additionalDoors: {}
            },
            ... (fs.existsSync('config.js') ? require('../../config.js') : {}),
        };
    }

    path() {
        return "/unlock"
    }

    description() {
        return "Unlocks the door"
    }

    handle(request, response, url, q) {
        if( q.id ) {
            let door = this.config.additionalDoors[q.id];
            if( door ) {
                openwebnet.run("doorUnlock", door.openSequence, door.closeSequence)
            } else {
                console.error("Door with id: " + q.id + " not found.")
            }
        } else {
            openwebnet.run("doorUnlock", this.config.doorUnlock.openSequence, this.config.doorUnlock.closeSequence)
        }

        response.writeHead(200, { "Content-Type": "text/plain" });
        response.write("DONE\n")
    }
}
