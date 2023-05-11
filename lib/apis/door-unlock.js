var net = require('net')

module.exports = class Api {
    path() {
	return "/unlock"
    }

    description() {
	return "Unlocks the door"
    }

    handle(request, response) {
        this.client = new net.Socket();
	this.seq = "*8*19*20##"
        this.client.numberOfRetries = 0;
        this.client.setTimeout(3000, () => { console.log('\t\tDL> [timeout connecting to bt_vct]'); this.client.end(); this.client.destroy()} );
        this.client.on('error', (err) => { console.error(err); this.client.destroy() })
        this.client.once('connect', () => { console.log('\t\tDL> [connected]') })
        this.client.on('data', (data) => { this.data(data) } )
        this.client.on('close', () => { console.log('\t\tDL> [closed]') })
        this.client.connect(30006, '127.0.0.1')
        console.log("\t\tDL -> + " + this.seq)
        this.client.write(this.seq)

        response.writeHead(200, {"Content-Type": "text/plain"});
        response.write("DONE\n")
    }

  data(data) {
        console.log('\t\tDL <- ' + data)
        if( data == '*#*0##') {
                if( this.client.numberOfRetries >= 3 ) this.client.destroy()
                setTimeout( () => {
                         this.client.numberOfRetries++
                         console.log("\t\tDL -> " + this.seq)
                         this.client.write(this.seq)
                }, 1000 )
        } else if( data == '*#*1##')  {
		if( this.seq == '*8*20*20##' ) {
			this.client.destroy()
		} else {
			setTimeout( () => {
				if( this.seq === '*8*19*20##' ) {
					this.seq = '*8*20*20##'
					console.log("\t\tDL -> + " + this.seq)
					this.client.write( this.seq )
				}
			}, 2000 )
		}
        } else {
                console.log('\t\tDL> ?????: ' + data )
        }
  }
}
