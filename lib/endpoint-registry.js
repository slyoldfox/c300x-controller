"use strict";

const https = require("https")
const CHECK_INTERVAL = 30 * 1000
const EVICT_AFTER = 5 * 60 * 1000

const requestOptions = {
   timeout: 2000,
   rejectUnauthorized: false
}

class EndpointRegistry {
    constructor() {
        this.endpoints = new Map()
	    this.streamEndpoint = undefined
	    this.streamCounter = 0
        this.timeout = setTimeout( () => {
            this.invalidateStaleEndpoints()
        }, CHECK_INTERVAL )
    }

   register( request, q ) {
	    var ip = request.headers['x-forwarded-for'] || request.socket.remoteAddress
        if( q.identifier && q.pressed && q.unlocked && q.locked ) {
            var identifier = q.identifier + "@" + ip
            var pressed = Buffer.from( q.pressed, 'base64').toString()
            var unlocked = Buffer.from( q.unlocked, 'base64').toString()
            var locked = Buffer.from( q.locked, 'base64').toString()

            var endpoint = {}
            endpoint['pressed'] = pressed
            endpoint['locked'] = locked
            endpoint['unlocked'] = unlocked
            endpoint['lastSeen'] = Date.now()

            this.endpoints.set( identifier, endpoint )
        } else if( q.updateStreamEndpoint ) {
		    this.updateStreamEndpoint( ip )
	    }
   }

   dispatchEvent( type ) {
	this.endpoints.forEach( (v,k) => {
		let url = v[type]
		if( url ) {
			https.get(url, requestOptions, (res) => { console.log( " [" + res.statusCode + "] for endpoint: " + url) })
		} else {
			console.error("Cannot dispatch event: " + type )
		}
	});
   }

   updateStreamEndpoint( endpoint ) {
                this.streamEndpoint = endpoint
                this.streamCounter = 3
                console.log(" => Streaming endpoint set to: " + this.streamEndpoint)
   }

   foreachEndpointIp( fun ) {
	let items = []
	this.endpoints.forEach( (v,k) => {
		let ip = k.split("@")[2];
		if( !items.includes( ip ) ) {
			//console.log("pushed: " + ip)
			items.push(ip)
		}
        });
	for( const item of items ) {
		let ipInHashForm = item.toString().replaceAll(/\./g, '#')
		fun( ipInHashForm )
	}
   }

   enableStream(fun) {
	if(this.streamEndpoint && this.streamCounter > 0 ) {
		//console.log("=> streaming endpoint is set to:"+this.streamEndpoint +":")
		if( this.streamEndpoint === 'all' ) {
			this.foreachEndpointIp( (ipInHashForm) => { fun(ipInHashForm ) } )
		} else {
			let ipInHashForm = this.streamEndpoint.toString().replaceAll(/\./g, '#')
			fun(ipInHashForm)
		}
		this.streamCounter--
	} else { 
		console.log( "Not enabling stream, streamEndpoint: " + this.streamEndpoint + " - streamCounter: " + this.streamCounter )
	}
   }

   invalidateStaleEndpoints() {
        for (const endpoint of this.endpoints.entries()) {
                if( endpoint[1].lastSeen && Date.now() > ( endpoint[1].lastSeen + EVICT_AFTER ) ) {
                        console.log("Removed stale endpoint: " + endpoint[0] )
                        this.endpoints.delete( endpoint[0] )
                }
        }
        this.timeout = setTimeout( () => this.invalidateStaleEndpoints(), CHECK_INTERVAL )
   }
}

module.exports = {
   create() {
        return new EndpointRegistry()
   }
}
