"use strict";

console.log("======= for use with BTicino plugin 0.0.15 =======")
const Api = require('./lib/api')
const MulticastListener = require("./lib/multicast-listener");
const udpProxy = require('./lib/udp-proxy')
const EndpointRegistry = require('./lib/endpoint-registry')
const mqtt = require('./lib/mqtt')

const registry = EndpointRegistry.create()
const api = Api.create(registry)
udpProxy.create()
MulticastListener.create(registry, api, mqtt.create(api))
