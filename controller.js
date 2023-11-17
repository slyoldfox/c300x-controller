"use strict";

console.log("======= for use with BTicino plugin 0.0.12 =======")
const Api = require('./lib/api')
const MulticastListener = require("./lib/multicast-listener");
const udpProxy = require('./lib/udp-proxy')
const EndpointRegistry = require('./lib/endpoint-registry')

const registry = EndpointRegistry.create()
const api = Api.create(registry)
udpProxy.create()
MulticastListener.create(registry, api)
