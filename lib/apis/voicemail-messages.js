const fs = require("fs");
const utils = require("../utils")

module.exports = class Api {
    path() {
        return "/voicemail"
    }

    description() {
        return "Displays voicemail messages"
    }

    handle(request, response, url, q) {
        if (!q.raw)
            response.write("<pre>")
        if (q.msg) {
            let filename = utils.MESSAGES_FOLDER + q.msg
            if (fs.existsSync(filename)) {
                if (filename.indexOf('.jpg') == 0 && filename.indexOf('.avi') == 0) {
                    response.end()
                } else {
                    if (filename.indexOf('.jpg') > 0)
                        response.writeHead(200, { "Content-Type": "image/jpeg" })
                    else {
                        let stats = fs.statSync(filename)
                        response.writeHead(200, { "Content-Type": "video/avi", "Accept-Ranges": "bytes", "Content-Length": stats.size, "Last-Modified-Time": stats.mtime })
                    }
                }
                response.end(fs.readFileSync(filename, { flag: 'r' }))

            } else {
                response.write("info for: " + q.msg)
            }
        } else {
            let files = utils.voiceMailMessages()
            files = files.sort(function (a, b) { return a.info.UnixTime - b.info.UnixTime; })
            if (files.length > 0) {
                response.write("Found " + files.length + " messages.")
                response.write("<ul>")
                files.forEach(f => {
                    response.write("<li>")
                    response.write("<img src='" + f.thumbnail + "'/> ")
                    response.write(f.info.Read == '1' ? "viewed" : "new")
                    //response.write('<source src="./voicemail?msg=' + f.file + '/aswm.avi&raw=true" type="video/mp4" /></video>')
                    response.write(" - " + f.info.Date)
                    //response.write("<a href='./voicemail?msg=" + f + "'>" + f.file + "</a>")
                    response.write("</li>")
                })
                response.write("<ul>")
                response.write('<script src="https://vjs.zencdn.net/8.0.4/video.min.js"></script>')
            } else {
                response.write("No messages found")
            }
        }
        if (!q.raw)
            response.write("</pre>")
    }
}
