const fs =  require("fs");
const path = require("path")
const messagesFolder = "/home/bticino/cfg/extra/47/messages/"
const ini = require("../ini")

module.exports = class Api {
    path() {
	return "/voicemail"
    }

    description() {
	return "Displays voicemail messages"
    }

    handle(request, response, url, q) {
	if( !q.raw ) 
		response.write("<pre>")
	if( q.msg ) {
		let filename = messagesFolder + q.msg
		if( fs.existsSync( filename )) {
			if( filename.indexOf('.jpg') == 0 && filename.indexOf('.avi') == 0 ) {
				response.end()
			} else {
				if( filename.indexOf('.jpg') > 0 )
					response.writeHead(200, {"Content-Type": "image/jpeg"})
				else
					response.writeHead(200, {"Content-Type": "video/mp4", "Accept-Ranges": "bytes"})
			}
			response.end(fs.readFileSync(filename, {flag:'r'}))
			
		} else {


		response.write("info for: " + q.msg)
		}
	} else { 		
		let files = []
		fs.readdirSync(messagesFolder ).forEach( file => {
			let resolvedFile = path.resolve(messagesFolder, file);
			let stat = fs.lstatSync(resolvedFile)
			if( stat.isDirectory() ) {
				let iniFile = messagesFolder + file + "/msg_info.ini"
				var info = ini.parse(fs.readFileSync( iniFile ))
				var vmMessage = info['Message Information']
    				files.push( { file: file.toString(), info: vmMessage })
			}
		});
		files = files.sort(function (a, b) { return a.info.UnixTime - b.info.UnixTime; })
		if( files.length > 0 ) {
			response.write("Found " + files.length + " messages.")
			response.write("<ul>")
			files.forEach( f => {
				response.write("<li>")
				response.write("<img src='./voicemail?msg=" + f.file + "/aswm.jpg&raw=true'/> ")
				response.write( f.info.Read == '1' ? "viewed" : "new")
				/*
				let x =`
<video
    id="my-video-${f.file}"
    class="video-js"
    controls
    preload="auto"
    width="296"
    height="166"
    poster="./voicemail?msg=${f.file}/aswm.jpg&raw=true"
    data-setup="{}"
  >
				`
				*/
				//response.write(x)
				//response.write('<source src="./voicemail?msg=' + f.file + '/aswm.avi&raw=true" type="video/mp4" /></video>')
				response.write(" - " + f.info.Date )
				//response.write("<a href='./voicemail?msg=" + f + "'>" + f.file + "</a>")
				response.write("</li>")
			})
			response.write("<ul>")
			response.write('<script src="https://vjs.zencdn.net/8.0.4/video.min.js"></script>')
		} else {
			response.write("No messages found")
		}
	}
	if( !q.raw )	
		response.write("</pre>")
    }
}
