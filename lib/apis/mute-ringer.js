const fs = require('fs')
const filename = '/var/tmp/conf.xml';
const openwebnet = require('../openwebnet.js')

module.exports = class Api {
    #muted = false

    path() {
        return "/mute"
    }

    description() {
        return "Enables/disables ringer"
    }

    handle(request, response, url, q) {
        if (q.enable || q.status) {
            if (q.enable == "true") {
                openwebnet.run("ringerMute").then( () => {
                    this.#mute()
                } )
            } else if (q.enable == "false") {
                this.forceReload = true
                openwebnet.run("ringerUnmute").then( () => {
                    this.#unmute()
                } )
            } else if (q.status == "true") {
                openwebnet.run("ringerStatus").then( (arg) => {
                    if( arg == '*#8**33*0##' ) {
                        this.#mute()
                    } else if( arg == '*#8**33*1##' ) {
                        this.#unmute()
                    }
                    let status = { "status": this.#muted }
                    response.writeHead(200, { "Content-Type": "text/json" })
                    response.end(JSON.stringify(status))                    
                } )
            }
        }
        if (!q.raw) {
            response.write("<pre>")
            response.write("<a href='./mute?enable=true'>Enable</a><br/>")
            response.write("<a href='./mute?enable=false'>Disable</a>")
            response.write("</pre>")
        }
    }

    #mute() {
        if(!this.#muted) {
            console.log("\t\tSetting to muted")
            this.#muted = true
        } else {
            console.log("\t\tRinger already muted")
        }          
    }

    #unmute() {
        if (this.#muted || this.forceReload) {
            this.forceReload = false
            console.log("\t\tSetting to unmuted")
            // For some reason the GUI of the intercom does not update internally
            // The intercom will not be muted, but when someone rings the intercom, it will mute itself again because of the internal state
            // We can force a 'reload' of the processes by touching /var/tmp/conf.xml so that the gui is in sync with the settings
            // A nasty side effect is that this also will disable sshd .. oh well .. might fix that later
            const time = new Date();
            try {
                fs.utimesSync(filename, time, time);
            } catch (e) {
                let fd = fs.openSync(filename, 'a');
                fs.closeSync(fd);
            }
            this.#muted = false
        } else {
            console.log("\t\tRinger already unmuted")
        }            
    }

    setMuted(mute) {
        //TODO: at some point we could opt to notify the registry to call external endpoints
        this.#muted = mute
    }

    get muted() {
        return this.#muted
    }
}
