const fs = require("fs");
const utils = require('../utils')

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
        if (q.verifyUser && q.identifier && "true" === q.verifyUser) {
            console.log("* Checking user setup")
            const identifier = q.identifier
            console.log("checking: " + identifier)
            errors = utils.verifyFlexisip(identifier)
        }
        body["errors"] = errors
        body["endpoints"] = Array.from(this.#endpointRegistry.endpoints)
        let result = JSON.stringify(body)
        response.write(result)
        if (q.raw)
            response.end()
    }
}
