var net = require('net');

class BtAvMedia {
  addStream(seq) {
        let client = new net.Socket();
	client.numberOfRetries = 0;
        client.setTimeout(3000, () => { console.log('\t\tS> [timeout connecting to bt_av_media]'); client.end(); client.destroy()} );
        client.on('error', function (err) { console.error(err); client.destroy() })
        client.once('connect', () => { console.log('\t\tS> [connected]') })	
	client.on('data', (data) => { this.data(client, seq, data) } )
	client.on('close', () => { console.log('\t\tS> [closed]') })
	console.log("\tAV > Preparing stream...")
	client.connect(30007, '127.0.0.1')
	console.log("\t\tS -> " + seq)
	client.write(seq)
  }

  addHighResVideoStream(ipInHashForm) {
	//this.addStream('*7*300#' + ipInHashForm + '#5007#0*##')
	this.addStream('*7*300#' + ipInHashForm + '#5002#0*##')
  }

  addVideoStream(ipInHashForm) {
	//this.addStream('*7*300#' + ipInHashForm + '#5002#1*##')
  }

  addAudioStream(ipInHashForm) {
	this.addStream('*7*300#' + ipInHashForm + '#5000#2*##')
  }

  data($client, seq, data) {
	console.log('\t\tS <- ' + data)
	if( data == '*#*0##') {
		if( $client.numberOfRetries >= 3 ) $client.destroy()
		setTimeout( () => {
			 $client.numberOfRetries++
			 console.log("\t\tS -> " + seq)
			 $client.write(seq)
		}, 1000 )
	} else if( data == '*#*1##')  {
		$client.destroy()
	} else {
		console.log('\t\tS> ?????: ' + data )
	}
  }
}

module.exports = {
    create() {
	return new BtAvMedia()
    }
}
