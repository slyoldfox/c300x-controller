const utils = require('../utils')

module.exports = class Api {
    path() {
        return "/start-dropbear"
    }

    description() {
        return "Starts dropbear (sshd)"
    }

    handle(request, response) {
        response.writeHead(200, { "Content-Type": "text/plain" });
        utils.startSsh( () => { response.write("DONE") } )
    }
}
