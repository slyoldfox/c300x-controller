"use strict";

const https = require("https")
const utils = require("./utils")
const debug = utils.getDebugger("endpoint-registry")
const CHECK_INTERVAL = 30 * 1000
const EVICT_AFTER = 5 * 60 * 1000

const requestOptions = {
   timeout: 2000,
   rejectUnauthorized: false
}

class EndpointRegistry {

   #endpoints = new Map()
   #streamEndpoint = undefined
   #streamCounter = 0
   #audioPort = 5000
   #videoPort = 5002
   #timeout = setTimeout(() => {
      this.#invalidateStaleEndpoints()
   }, CHECK_INTERVAL)

   register(request, q) {
      var ip = request.headers['x-forwarded-for'] || request.socket.remoteAddress
      if (q.identifier && q.pressed && q.unlocked && q.locked) {
         var identifier = q.identifier + "@" + ip
         var pressed = Buffer.from(q.pressed, 'base64').toString()
         var unlocked = Buffer.from(q.unlocked, 'base64').toString()
         var locked = Buffer.from(q.locked, 'base64').toString()

         var endpoint = {}
         endpoint['pressed'] = pressed
         endpoint['locked'] = locked
         endpoint['unlocked'] = unlocked
         endpoint['lastSeen'] = Date.now()

         this.#endpoints.set(identifier, endpoint)
      } else if (q.updateStreamEndpoint) {
         this.updateStreamEndpoint(ip)
      }
   }

   dispatchEvent(type) {
      this.#endpoints.forEach((v, k) => {
         let url = v[type]
         if (url) {
            https.get(url, requestOptions, (res) => { console.log(" [" + res.statusCode + "] for endpoint: " + url) })
         } else {
            console.warn(`Ignoring dispatch event '${type}' for endpoint: ${k}`)
         }
      });
   }

   updateStreamEndpoint(endpoint, audioPort, videoPort) {
      this.#streamEndpoint = endpoint
      this.#streamCounter = 2
      this.#audioPort = audioPort || 5000
      this.#videoPort = videoPort || 5002
      debug(` => Streaming endpoint set to: ${this.#streamEndpoint} - audioPort: ${this.#audioPort} / videoPort: ${this.#videoPort}` )
   }

   #foreachEndpointIp(fun) {
      let items = new Map()
      this.#endpoints.forEach((v, k) => {
         let ip = k.split("@")[2];
         if (!items.get(ip)) {
            console.log("Adding ENDPOINT IP: " + ip)
            items.set(ip, v)
         }
      });
      items.forEach( (v,k) => {
         if( v.videoPort && v.audioPort ) {
            fun(k.toString(), v.audioPort, v.videoPort)
         } else {
            fun(k.toString(), this.#audioPort, this.#videoPort)
         }
      } )
   }

   enableStream(fun) {
      if (this.#streamEndpoint && this.#streamCounter > 0) {
         console.log(`=> streaming endpoint is set to:${this.#streamEndpoint}: counter: ${this.#streamCounter}`)
         if (this.#streamEndpoint === 'all') {
            this.#foreachEndpointIp((ip, audioPort, videoPort) => { fun(ip, audioPort, videoPort) })
         } else {
            fun(this.#streamEndpoint.toString(), this.#audioPort, this.#videoPort)
         }
         this.#streamCounter--
         console.log(`=> streaming endpoint is set to:${this.#streamEndpoint}: counter: ${this.#streamCounter} DONE`)
      } else {
         console.log("Not enabling stream, streamEndpoint: " + this.#streamEndpoint + " - streamCounter: " + this.#streamCounter)
      }
   }

   #invalidateStaleEndpoints() {
      for (const endpoint of this.#endpoints.entries()) {
         if (endpoint[1].lastSeen && Date.now() > (endpoint[1].lastSeen + EVICT_AFTER)) {
            console.log("Removed stale endpoint: " + endpoint[0])
            this.#endpoints.delete(endpoint[0])
         }
      }
      this.#timeout = setTimeout(() => this.#invalidateStaleEndpoints(), CHECK_INTERVAL)
   }

   get endpoints() {
      return this.#endpoints
   }
}

module.exports = {
   create() {
      return new EndpointRegistry()
   }
}
