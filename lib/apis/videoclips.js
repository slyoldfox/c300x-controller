const fs = require("fs");
const path = require("path")
const messagesFolder = "/home/bticino/cfg/extra/47/messages/"
const ini = require("../ini")

module.exports = class Api {
	path() {
		return "/videoclips"
	}

	description() {
		return "json api for scripted videoclips"
	}

	handle(request, response, url, q) {
		if (!q.raw) {
			response.write("<pre>Call with /videoclips?raw=true</pre>")
			return
		}

		let files = []
		let startTime = q.startTime ?? 0
		let endTime = q.endTime ?? 999999999999
		fs.readdirSync(messagesFolder).forEach(file => {
			let resolvedFile = path.resolve(messagesFolder, file);
			let stat = fs.lstatSync(resolvedFile)
			if (stat.isDirectory()) {
				let iniFile = messagesFolder + file + "/msg_info.ini"
				var info = ""
				var vmMessage = ""
				var time = undefined
				if (fs.existsSync(iniFile)) {
					info = ini.parse(fs.readFileSync(iniFile))
					vmMessage = info['Message Information']
					time = parseInt(vmMessage.UnixTime)
					if (time >= parseInt(startTime) && time <= parseInt(endTime))
						files.push({ file: file.toString(), info: vmMessage })
				} else {
					//This does occur, but it seems to hold 0 bytes .avi files and thumbnails so ignore them

					//time = parseInt( stat.mtime.getTime() / 1000 )
				}

			}
		});
		files = files.sort(function (a, b) { return a.info.UnixTime - b.info.UnixTime; })
		response.writeHead(200, { "Content-Type": "text/json" })
		if (files.length > 0) {
			//let x = JSON.stringify(files)
			response.end(JSON.stringify(files))

			files.forEach(f => {
				//response.write(x)
				//response.write('<source src="./voicemail?msg=' + f.file + '/aswm.avi&raw=true" type="video/x-msvideo" /></video>')
				//response.write(" - " + f.info.Date )
				//response.write("<a href='./voicemail?msg=" + f + "'>" + f.file + "</a>")
				//response.write("</li>")
			})
		} else {
			response.end("[]")
		}
	}
}
