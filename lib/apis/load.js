const fs = require("fs");
const utils = require('../utils')

module.exports = class Api {
    path() {
        return "/load"
    }

    description() {
        return "Displays unit temperature and load"
    }

    handle(request, response) {
        response.write("<pre>")
        response.write( utils.model() + " cpu temperature: \n");
        response.write( utils.temperature() + "\n\n");
        response.write("Load:\n");
        response.write( utils.load() )
        response.write("</pre>")
    }
}
