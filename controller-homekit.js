#!/usr/bin/env node

//
// WARNING: Work in progress - use at your own risk .. API and code may change in the future without backwards compatibility
// 

const base = require('./base')
const config = require('./config')
const sdpserver = require('./lib/sdpserver')
const utils = require('./lib/utils')
const homekitBundle = require('./lib/homekit/homekit-bundle')
const jsonstore = require('./json-store')
const openwebnet = require('./lib/openwebnet')
const BASE_PATH = __dirname
const filestore = jsonstore.create( BASE_PATH + '/config-homekit.json')
const model = utils.model().toLocaleUpperCase()

sdpserver.create(base.registry)

utils.fixMulticast()

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
        source: '-i tcp://127.0.0.1:8081', // or tcp://192.168.0.XX:8081 in development
        audio: true,
        stillImageSource: '-i https://iili.io/JZq8pwB.jpg',
        debugReturn: false,
        returnAudioTarget: "-codec:a speex -ar 8000 -ac 1 -f rtp -payload_type 97 rtp://127.0.0.1:4000" // or rtp://192.168.0.XX:40004 in development
    }
})

const homekitManager = new homekitBundle.HomekitManager( base.eventbus, BASE_PATH, bridgeConfig, videoConfig, config.version, model, videoConfig)

base.eventbus.on('doorbell:pressed', () => {
    //console.log('doorbell:pressed')
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
            if( result == '*#8**33*0##' ) {
                return true
            } else if( result == '*#8**33*1##' ) {
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
                    return matches[0][1] == '1'
                }
                return false
            } )
        })
}

openwebnet.run("firmwareVersion").catch( ()=>{} ).then( (result) => {
    homekitManager.updateFirmwareVersion(result)
})