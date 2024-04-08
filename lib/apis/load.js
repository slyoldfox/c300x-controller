const fs = require("fs");
const utils = require('../utils.js')

module.exports = class Api {
    path() {
        return "/load"
    }

    description() {
        return "Displays unit temperature and load"
    }

    handle(request, response) {
        response.write("<pre>")
        response.write("C300X cpu temperature: \n");
        response.write( utils.temperature()  + "\n\n");
        response.write("Load:\n");
        response.write( utils.load() )
        response.write("</pre>")
    }
}
