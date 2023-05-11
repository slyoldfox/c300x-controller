"use strict";

const dgram = require('dgram');

class UdpProxy {
   listen() {
	var socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
	var client = dgram.createSocket('udp4');
	socket.on('message', (msg, info) => { 
		client.send(msg,4000,'127.0.0.1',(error) => {
			if(error){
				console.error(error)
    				//client.close();
  			}else{
    				//console.log('Data sent !!!');
			}
  		})
	})

	socket.on('listening', () => {
		var address = socket.address();
    	   	console.log("UdpProxy listening on " + address.port + " to proxy audio packets to linphone -> (udp/4000)")
	});

	socket.bind(40004);
   }
}

module.exports = {
   create() {
	return new UdpProxy().listen()
   }
}
