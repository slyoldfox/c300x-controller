#!/usr/bin/env node

//
// WARNING: Work in progress - use at your own risk .. API and code may change in the future without backwards compatibility
// 

const base = require('./base')
const config = require('./config')
const utils = require('./lib/utils')

utils.fixMulticast()
utils.verifyFirewall()

const rtspserver = require('./lib/rtsp-server')

const homekitBundle = require('./lib/homekit/homekit-bundle')
const jsonstore = require('./json-store')
const openwebnet = require('./lib/openwebnet')
const BASE_PATH = __dirname
const filestore = jsonstore.create( BASE_PATH + '/config-homekit.json')
const model = utils.model().toLocaleUpperCase()

rtspserver.create(base.registry, base.eventbus)
utils.verifyFlexisip('webrtc@' + utils.domain()).forEach( (e) => console.error( `* ${e}`) )

const bridgeConfig = filestore.read('_bridge', () => {
    return {
        'username': homekitBundle.createHAPUsername(),
        'pinCode': homekitBundle.randomPinCode(),
        'displayName': 'BTicino Bridge'
       }
});

const videoConfig = filestore.read('videoConfig', () => {
    return {
        username: homekitBundle.createHAPUsername(),
        pinCode: homekitBundle.randomPinCode(),
        displayName: model,
        vcodec: 'copy',
        source: '-i rtsp://127.0.0.1:6554/doorbell', // or -i rtsp://192.168.0.XX:6554/doorbell in development
        audio: true,
        stillImageSource: '-i rtsp://127.0.0.1:6554/doorbell-video',
        debug: false,
        debugReturn: false,
        hksv: true,
        videoFilter: "select=gte(n\\,6)", // select frame 6 from the stream for the snapshot image, previous frames may contain invalid images
        returnAudioTarget: "-codec:a speex -ar 8000 -ac 1 -f rtp -payload_type 97 rtp://127.0.0.1:4000" // or rtp://192.168.0.XX:40004 in development
    }
})

if( videoConfig.source?.indexOf("tcp://") >= 0 ) {
    throw new Error("Please change your videoConfig.source, tcp://127.0.0.1:8081 is deprecated and replaced by rtsp://127.0.0.1:6554/doorbell")
}

const homekitManager = new homekitBundle.HomekitManager( base.eventbus, BASE_PATH, bridgeConfig, videoConfig, config.version, model, videoConfig)
const {doorbell, streamingDelegate} = homekitManager.addDoorbell(videoConfig)

base.eventbus.on('doorbell:pressed', () => {
    console.log('doorbell:pressed')
    base.eventbus.emit('homekit:pressed')
})     

const locks = ["default", ...Object.keys(config.additionalLocks)]

for (const lock of locks) {
    const doorHomekitSettings = filestore.read(lock, () => { return { 'displayName': lock, 'hidden': false } })

    if( doorHomekitSettings && doorHomekitSettings.hidden ) 
        continue

    let door = config.additionalLocks[lock];
    const { openSequence, closeSequence } = lock === "default" ? { openSequence: config.doorUnlock.openSequence, closeSequence: config.doorUnlock.closeSequence } : { openSequence: door.openSequence, closeSequence: door.closeSequence }
    base.eventbus
        .on('lock:unlocked:' + openSequence, () => {
            //console.log('received lock:unlocked:' + openSequence)
            base.eventbus.emit('homekit:locked:' + lock, false)
        }).on('lock:locked:' + closeSequence, () => {
            //console.log('received lock:locked:' + closeSequence)
            base.eventbus.emit('homekit:locked:' + lock, true)
    })        

    homekitManager.addLock( lock, doorHomekitSettings.displayName )
        .unlocked( () => {
            openwebnet.run("doorUnlock", openSequence, closeSequence)
    } )
}

homekitManager.addSwitch('Muted' )
    .switchedOn( () => {openwebnet.run("ringerMute")} )
    .switchedOff( () => { openwebnet.run("ringerUnmute").then( () => utils.reloadUi() ) } )
    .updateState( () => {
        return openwebnet.run("ringerStatus").then( (result) => {
            if( result === '*#8**33*0##' ) {
                return true
            } else if( result === '*#8**33*1##' ) {
                return false
            }        
        } )
} )

if( model !== 'C100X' ) {
    homekitManager.addSwitch('Voicemail')
        .switchedOn( () => { openwebnet.run("aswmEnable") } )
        .switchedOff( () => { openwebnet.run("aswmDisable") } )
        .updateState( () => {
            return openwebnet.run("aswmStatus").then( result => {
                const matches = [...result.matchAll(/\*#8\*\*40\*([01])\*([01])\*/gm)]
                if( matches && matches.length > 0 && matches[0].length > 0 ) {
                    return matches[0][1] === '1'
                }
                return false
            } )
        })
}

openwebnet.run("firmwareVersion").catch( ()=>{} ).then( (result) => {
    homekitManager.updateFirmwareVersion(result)
})

const homekit = new class Api {
	path() {
		return "/homekit"
	}

	description() {
		return "Homekit debug page"
	}

	async handle(request, response, url, q) {
        if(!q.raw) {
            response.write("<pre>")
            response.write("<a href='./homekit?press=true'>Emulate homekit doorbell press</a><br/>")
            response.write("<a href='./homekit?thumbnail=true&raw=true'>Video thumbnail (cached)</a><br/>")
            response.write("<a href='./homekit?thumbnail=true&raw=true&refresh=true'>Video thumbnail (uncached)</a><br/>")
            response.write("</pre>")
        }

        if(q.press === "true") {
            base.eventbus.emit('homekit:pressed')
        }
        if(q.motion === "true") {
            base.eventbus.emit('homekit:motion', q.motionTime)
        }        
        if(q.thumbnail === "true") {
            if(!q.raw || q.raw !== "true" ) {
                response.write("<br/>Call this url with &raw=true")
            } else {
                const request = {}
                if(q.refresh === 'true'){
                    streamingDelegate.snapshotPromise = undefined
                }
                streamingDelegate.handleSnapshotRequest(request, (error, image) => {
                    if(image)
                        response.write(image)
                    response.end()
                })
            }

        }
        videoConfig.debug = q.enablevideodebug === 'true';
	}
}

base.api.apis.set(homekit.path(), homekit )