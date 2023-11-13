var net = require('net')

module.exports = class Api {
    path() {
	    return "/aswm"
    }

    description() {
	    return "Enables/disables answering machine"
    }

    handle(request, response, url, q) {
	this.commands = []	
	this.incoming = ''
	response.write("<pre>")
	response.write("<a href='./aswm?enable=true'>Enable</a><br/>")
	response.write("<a href='./aswm?enable=false'>Disable</a>")
	response.write("</pre>")
	if( q.enable ) {
		//TODO: refactor this logic into a class for usability
		this.sleep(100).then( () => {
			this.handleData()
		})
        	this.client = new net.Socket();
        	this.client.numberOfRetries = 0;
        	this.client.setTimeout(3000, () => { console.log('\t\tDL> [timeout connecting to openserver]'); this.client.end(); this.client.destroy()} );
        	this.client.on('error', (err) => { console.error(err); this.client.destroy() })
        	this.client.once('connect', () => { console.log('\t\tDL> [connected]') })
        	this.client.on('data', (data) => { this.data(data) } )
        	this.client.on('close', () => { console.log('\t\tDL> [closed]'); })
        	this.client.connect(20000, '127.0.0.1')
		this.commands.push("*99*0##")
		if( q.enable == "true" ) {
			this.commands.push("*8*91##")
		} else {
			this.commands.push("*8*92##")
		}
	}
    }


  data(data) {
	console.log('\t\tDL <- :' + data + ':')
	this.incoming += data
  }

    handleData() {
	if( this.commands.length == 0 && this.incoming == '' ) {
		this.client.destroy();
		return;
	}
	//TODO: when refactoring, make sure we match more exotic replies
	const results = this.incoming.match(/\*#.*?##/g);
	if( results && results.length > 0 ) {
		var result = results[0]
		if( result == "*#*1##" ) {
			this.incoming = this.incoming.replace(result, '')
			if( this.commands.length > 0 ) {
				const seq = this.commands.shift()
				console.log("\t\tS -> " + seq)
				this.client.write(seq)
			}
		} else {
			//TODO: handle retries when refactoring
			console.log("\t\tS> Error during reply: " + result);
		}
	}
	if(this.client) {
		this.sleep(100).then( () => {
        	        this.handleData()
        	})
	}
    }

   async sleep(ms) {
     await new Promise(resolve => setTimeout(resolve, ms))
   }
}
