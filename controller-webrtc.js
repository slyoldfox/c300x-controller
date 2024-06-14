#!/usr/bin/env node

// Check the documentation if you wish to use webrtc with HA:
// 
// https://github.com/slyoldfox/c300x-controller?tab=readme-ov-file#webrtc
// 

const base = require('./base')
const rtspserver = require('./lib/rtsp-server')
const utils = require('./lib/utils')

utils.verifyFlexisip('webrtc@' + utils.domain()).forEach( (e) => console.error( `* ${e}`) )

rtspserver.create(base.registry)