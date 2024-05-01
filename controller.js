#!/usr/bin/env node

"use strict";
var package_json = require('./package.json');

console.log(`======= c300x-controller ${package_json.version} for use with BTicino plugin 0.0.15 =======`)
const Api = require('./lib/api')
const MulticastListener = require("./lib/multicast-listener");
const udpProxy = require('./lib/udp-proxy')
const EndpointRegistry = require('./lib/endpoint-registry')
const mqtt = require('./lib/mqtt')

const registry = EndpointRegistry.create()
const api = Api.create(registry)
udpProxy.create( 40004, '0.0.0.0', 4000, '127.0.0.1' )
MulticastListener.create(registry, api, mqtt.create(api))
