const fs = require("fs");

module.exports = class Api {

    #endpointRegistry

    path() {
        return "/register-endpoint"
    }

    description() {
        // NOTE: requestor must re-register at least once within EVICT_AFTER seconds or it will be evicted
        return "Registers endpoints to send doorbell pressed, door locked and door unlocked."
    }

    endpointRegistry(registry) {
        this.#endpointRegistry = registry
    }

    handle(request, response, parsedUrl, q) {
        this.#endpointRegistry.register(request, q)
        let body = {}
        let errors = []
        if (q.verifyUser && q.identifier && "true" == q.verifyUser) {
            console.log("* Checking user setup")
            var identifier = q.identifier
            console.log("checking: " + identifier)
            this.matchStringInFile("/etc/flexisip/users/users.db.txt",
                (line) => { return line.startsWith(identifier) },
                () => errors.push("The user '" + identifier + "' does not seem to be added to /etc/flexisip/users/users.db.txt!")
            )
            this.matchStringInFile("/etc/flexisip/users/route.conf",
                (line) => { return line.startsWith("<sip:" + identifier + ">") },
                () => errors.push("The sip user '<sip:" + identifier + ">' is not added to /etc/flexisip/users/route.conf !")
            )
            this.matchStringInFile("/etc/flexisip/users/route_int.conf",
                (line) => { return line.indexOf("<sip:" + identifier + ">") > 0 },
                () => errors.push("The sip user '<sip:" + identifier + ">' is not added to the alluser line in /etc/flexisip/users/route_int.conf !")
            )
            console.log("* [DONE] checking user setup")
        }
        body["errors"] = errors
        body["endpoints"] = Array.from(this.#endpointRegistry.endpoints)
        let result = JSON.stringify(body)
        response.write(result)
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
