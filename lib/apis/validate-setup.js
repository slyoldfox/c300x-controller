const fs = require("fs")
const utils = require("../utils")

module.exports = class Api {
    path() {
        return "/validate-setup"
    }

    description() {
        return "Validates the compatibility of the unit for scrypted"
    }

    handle(request, response, parsedUrl, q) {
        const ip = request.headers['x-forwarded-for'] || request.socket.remoteAddress
        //ip += "."

        var setup = {}
        var errors = []
        setup['domain'] = utils.domain()
        setup['model'] = utils.model()

        if( setup['model'] === "unknown" ) {
            errors.push("Unknown model in <name> tag in /var/tmp/conf.xml")
        }

        // Verify trusted-hosts
        this.matchStringInFile("/home/bticino/cfg/flexisip.conf",
            (line) => { return line.startsWith('trusted-hosts=') && line.indexOf(ip) > 0 },
            () => { errors.push(`Please add the IP ${ip} to /home/bticino/cfg/flexisip.conf or scrypted won't be able to talk to the SIP server.`) }
        )

        setup['errors'] = errors
        response.write(JSON.stringify(setup))
        if (q.raw)
            response.end()
    }

    matchStringInFile(filename, lineMatcher, errorHandler) {
        var lines = fs.readFileSync(filename).toString().split('\n')
        console.log("file: " + filename + " contains " + lines.length + " lines.")
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i]
            if (lineMatcher(line)) {
                console.log("   [OK]")
                return true
            }
        }
        errorHandler()
    }
}
