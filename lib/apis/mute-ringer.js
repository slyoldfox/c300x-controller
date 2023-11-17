const net = require('net')
const fs = require('fs')
const filename = '/var/tmp/conf.xml';

module.exports = class Api {
    constructor() {
        this.muted = false
    }
    path() {
        return "/mute"
    }

    description() {
        return "Enables/disables ringer"
    }

    handle(request, response, url, q) {
        this.commands = []
        this.incoming = ''

        if (q.enable || q.status) {
            //TODO: refactor this logic into a class for usability
            this.sleep(100).then(() => {
                this.handleData(response, q)
            })
            this.client = new net.Socket();
            this.client.numberOfRetries = 0;
            this.client.setTimeout(3000, () => { console.log('\t\tDL> [timeout connecting to openserver]'); this.client.end(); this.client.destroy() });
            this.client.on('error', (err) => { console.error(err); this.client.destroy() })
            this.client.once('connect', () => { console.log('\t\tDL> [connected]') })
            this.client.on('data', (data) => { this.data(data) })
            this.client.on('close', () => { console.log('\t\tDL> [closed]'); })
            this.client.connect(20000, '127.0.0.1')
            this.commands.push("*99*0##")
            if (q.enable == "true") {
                this.commands.push("*#8**#33*0##")
            } else if (q.enable == "false") {
                this.forceReload = true
                this.commands.push("*#8**#33*1##")
            } else if (q.status == "true") {
                this.commands.push("*#8**33##")
            }
        }
        if (!q.raw) {
            response.write("<pre>")
            response.write("<a href='./mute?enable=true'>Enable</a><br/>")
            response.write("<a href='./mute?enable=false'>Disable</a>")
            response.write("</pre>")
        }
    }

    setMuted(mute) {
        //TODO: at some point we could opt to notify the registry to call external endpoints
        this.muted = mute
    }

    data(data) {
        console.log('\t\tDL <- :' + data + ':')
        this.incoming += data
    }

    handleData(response, q) {
        if (this.commands.length == 0 && this.incoming == '') {
            if (q.status) {
                let status = { "status": this.muted }
                response.writeHead(200, { "Content-Type": "text/json" })
                response.end(JSON.stringify(status))
            }
            this.client.destroy();
            return;
        }
        //TODO: when refactoring, make sure we match more exotic replies
        const results = this.incoming.match(/\*#.*?##/g);
        if (results && results.length > 0) {
            var result = results[0]
            if (result == "*#*1##") {
                this.incoming = this.incoming.replace(result, '')
                if (this.commands.length > 0) {
                    const seq = this.commands.shift()
                    console.log("\t\tS -> " + seq)
                    this.client.write(seq)
                }
            } else if (result == "*#8**33*0##") {
                this.incoming = this.incoming.replace(result, '')
                if(!this.muted) {
                    console.log("\t\tSetting to muted")
                    this.muted = true
                } else {
                    console.log("\t\tRinger already muted")
                }
            } else if (result == "*#8**33*1##") {
                this.incoming = this.incoming.replace(result, '')
                if (this.muted || this.forceReload) {
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
                    this.muted = false
                } else {
                    console.log("\t\tRinger already unmuted")
                }
            } else {
                //TODO: handle retries when refactoring
                console.log("\t\tS> Error during reply: " + result);
            }
        }
        if (this.client) {
            this.sleep(100).then(() => {
                this.handleData(response, q)
            })
        }
    }

    async sleep(ms) {
        await new Promise(resolve => setTimeout(resolve, ms))
    }
}
