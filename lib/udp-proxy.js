"use strict";

const dgram = require('dgram');

class UdpProxy {

	#server = dgram.createSocket({ type: 'udp4', reuseAddr: true });
	#client = dgram.createSocket('udp4');

	constructor( listenPort, listenAddress, destinationPort, destinationAddress ) {
		this.#server.on('message', (msg, info) => {
			this.#client?.send(msg, destinationPort, destinationAddress, (error) => {
				if (error) {
					console.error(error)
				} else {
					//console.log('Data sent !!!');
				}
			})
		})

		this.#server.on('listening', () => {
			var address = this.#server.address();
			console.log("UdpProxy listening on " + address.address + ':' + address.port + " to proxy packets to -> (udp/" + destinationAddress + ':' + destinationPort + ")")
		});

		this.#server.bind(listenPort, listenAddress);
	}

	destroy() {
		console.log("destroying udp proxy")
		try {
			this.#client.close()
			this.#client = undefined
		} catch(e) {
			console.log("ignored error in client close")
		}
		try {
			this.#server.close()
		} catch(e) {
			console.log("ignored error in server close")
		}
		
		console.log("done destroying")
	}
}

module.exports = {
	create( listenPort, listenAddress, destinationPort, destinationAddress ) {
		return new UdpProxy( listenPort, listenAddress, destinationPort, destinationAddress )
	}
}
