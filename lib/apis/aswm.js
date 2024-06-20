const openwebnet = require('../openwebnet')

module.exports = class Api {
	path() {
		return "/aswm"
	}

	description() {
		return "Enables/disables answering machine"
	}

	handle(request, response, url, q) {
		response.write("<pre>")
		response.write("<a href='./aswm?enable=true'>Enable</a><br/>")
		response.write("<a href='./aswm?enable=false'>Disable</a>")
		response.write("</pre>")
		if (q.enable) {
			if (q.enable === "true") {
				openwebnet.run("aswmEnable")
			} else {
				openwebnet.run("aswmDisable")
			}
		}
	}
}
