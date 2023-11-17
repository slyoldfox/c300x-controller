var net = require('net')

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
                console.log("\t\tSetting to muted")
                this.muted = true
            } else if (result == "*#8**33*1##") {
                this.incoming = this.incoming.replace(result, '')
                console.log("\t\tSetting to unmuted")
                this.muted = false
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
