"use strict";

const dgram = require("dgram");
const parser = require("./message-parser.js")
//const aswm = require("./handlers/aswm-handler.js")
const systemHandler = require("./handlers/openwebnet-handler.js")

const logUnknown = false

class MulticastListener {
	constructor(registry, api) {
		this.registry = registry
		this.publicKey = Date.now()
		this.parser = parser.create()
		this.handlers = new Map()

		//this.handlers.set('aswm', aswm.create() )
		this.handlers.set('OPEN', systemHandler.create(registry, api))

		const socket = dgram.createSocket({ type: "udp4", reuseAddr: true })
		socket.bind(7667)
		socket.on("message", (data, rinfo) => {
			try {
				this.handleMessage(data, rinfo)
			} catch (e) {
				console.error("Error handling message: " + data, e)
			}
		})
		socket.on("listening", () => {
			console.log('MulticastListener listening on 7667 for multicast events')
			//This is a fixed IP where Bticino dbus daemon sends UDP packets to
			socket.addMembership("239.255.76.67");
		});
		socket.on("error", err => {
			console.error(err);
		});
	}

	handleMessage(data, rinfo) {
		let { system, msg } = this.parser.parse(data);

		var handler = this.handlers.get(system)
		if (handler && handler.handle) {
			try {
				if (!handler.handle(this, system, msg) && logUnknown) {
					console.warning("Unhandled: '" + msg + "' on system: " + system)
				}
			} catch (e) {
				console.error("Error: " + e.message, e)
			}
		} else {
			if (logUnknown)
				console.error("Cannot handle: '" + msg + "' on system: " + system)
		}
	}

	timeLog(data) {
		console.log("= " + new Date().toLocaleString() + " => " + data);
	}
}

module.exports = {
	create(registry, api) {
		return new MulticastListener(registry, api)
	}
}
