const fs = require("fs")
const utils = require("../utils")
const openwebnet = require('../openwebnet')
const config = require('../../config')

module.exports = class Api {
    path() {
        return "/validate-setup"
    }

    description() {
        return "Validates the compatibility of the unit for scrypted"
    }

    async handle(request, response, parsedUrl, q) {
        const ip = request.headers['x-forwarded-for'] || request.socket.remoteAddress
        //ip += "."

        var setup = {}
        var errors = []
        setup['domain'] = utils.domain()
        setup['model'] = utils.model()
        setup['macAddress'] = await openwebnet.run("macAddress")
        setup['firmware'] = await openwebnet.run("firmwareVersion")
        setup['version'] = config.version

        if( setup['model'] === "unknown" ) {
            errors.push("Unknown model in <name> tag in /var/tmp/conf.xml")
        }

        // Verify trusted-hosts
        utils.matchStringInFile("/home/bticino/cfg/flexisip.conf",
            (line) => { return line.startsWith('trusted-hosts=') && line.indexOf(ip) > 0 },
            () => { errors.push(`Please add the IP ${ip} to /home/bticino/cfg/flexisip.conf or scrypted won't be able to talk to the SIP server.`) }
        )

        setup['errors'] = errors
        response.write(JSON.stringify(setup))
        if (q.raw)
            response.end()
    }
}
