const openwebnet = require('../openwebnet.js')
const config = require('../../config.js')

module.exports = class Api {
    path() {
        return "/unlock"
    }

    description() {
        return "Unlocks the door"
    }

    handle(request, response, url, q) {
        if( q.id ) {
            let door = config.additionalLocks[q.id];
            if( door ) {
                openwebnet.run("doorUnlock", door.openSequence, door.closeSequence)
            } else if( q.id === "default" ) {
                openwebnet.run("doorUnlock", config.doorUnlock.openSequence, config.doorUnlock.closeSequence)
            } else {
                console.error("Door with id: " + q.id + " not found.")
            }
        } else {
            response.write("<pre>")
            response.write("<a href='./unlock?id='default'>Default</a><br/>")
            if( config.additionalLocks )
            {
                for( const lock in config.additionalLocks )
                {
                    response.write("<a href='./unlock?id='" + lock + "'>" + lock + "</a><br/>")
                }
            }
            response.write("</pre>")
        }

        response.writeHead(200, { "Content-Type": "text/plain" });
        response.write("DONE\n")
    }
}
