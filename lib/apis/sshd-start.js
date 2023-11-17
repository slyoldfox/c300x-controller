const fs = require("fs");

module.exports = class Api {
    path() {
        return "/start-dropbear"
    }

    description() {
        return "Starts dropbear (sshd)"
    }

    handle(request, response) {
        response.writeHead(200, { "Content-Type": "text/plain" });
        require('child_process').exec('/etc/init.d/dropbear start', (msg) => { response.write("DONE") });
    }
}
