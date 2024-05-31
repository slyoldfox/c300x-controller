"use strict";

const dgram = require("dgram");
const parser = require("./message-parser")
//const aswm = require("./handlers/aswm-handler")
const openwebnetHandler = require("./handlers/openwebnet-handler")

const logUnknown = false

class MulticastListener {

	#parser = parser.create()
	#handlers = new Map()

	constructor(registry, api, mqtt, eventbus) {
		//this.handlers.set('aswm', aswm.create() )
		this.#handlers.set('OPEN', openwebnetHandler.create(registry, api, mqtt, eventbus))

		const socket = dgram.createSocket({ type: "udp4", reuseAddr: true })
		socket.bind(7667)
		socket.on("message", (data, rinfo) => {
			try {
				this.#handleMessage(data, rinfo)
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

	#handleMessage(data, rinfo) {
		let { system, msg } = this.#parser.parse(data);
		var handler = this.#handlers.get(system)
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

	handler(name) {
		return this.#handlers.get(name)
	}

	timeLog(data) {
		console.log("= " + new Date().toLocaleString() + " => " + data);
	}
}

module.exports = {
	create(registry, api, mqtt, eventbus) {
		return new MulticastListener(registry, api, mqtt, eventbus)
	}
}
