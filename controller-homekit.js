#!/usr/bin/env node

//
// WARNING: Work in progress - use at your own risk .. API and code may change in the future
// 

const base = require('./base')
const config = require('./config')
const sdpserver = require('./lib/sdpserver')
const utils = require('./lib/utils')
sdpserver.create(base.registry)

const homekitBundle = require('./lib/homekit/homekit-bundle')
const jsonstore = require('./jsonstore')
const child_process = require('child_process')

const filestore = jsonstore.create( __dirname + '/config-homekit.json')
let bridgeConfig = filestore.read('_bridge');

try {
    let output = child_process.execSync("ip route show exact 224.0.0.0/4 dev wlan0", {timeout: 2500}).toString()
    //console.log(`output of ip route show: ${output}`)
    if( output.length == 0 ) {
        console.log("!!! Could not detect multicast route on wlan0, adding it ... to support bonjour.")
        child_process.execSync("/sbin/route add -net 224.0.0.0 netmask 240.0.0.0 dev wlan0")
    }
} catch( e ) {
    console.error("Failure retrieving or modifying route.")
}

if (!bridgeConfig) {
    bridgeConfig = {
     'username': homekitBundle.createHAPUsername(),
     'pinCode': homekitBundle.randomPinCode(),
     'displayName': 'BTicino Bridge'
    }
    filestore.write('_bridge', bridgeConfig)
}

const model = utils.model().toLocaleUpperCase()
const homekitManager = new homekitBundle.HomekitManager(bridgeConfig, config.version, model)
const openwebnet = require('./lib/openwebnet')

function getDoorHomekitSettings(name) {
    let doorOptions = filestore.read(name)
    if( !doorOptions ) {
        doorOptions = { 'displayName': name }
        filestore.write(name, doorOptions)
    }
    return doorOptions
}

for (lock in config.additionalLocks) {
    let doorHomekitSettings = getDoorHomekitSettings(lock)
    if( doorHomekitSettings && doorHomekitSettings.hidden ) 
        continue
        homekitManager.addLock(doorHomekitSettings.displayName, 
            () => {
                console.log("calling doorUnlock: " + lock)
                openwebnet.run("doorUnlock", door.openSequence, door.closeSequence)
            })
}

let doorHomekitSettings = getDoorHomekitSettings("default")
homekitManager.addLock(doorHomekitSettings.displayName, 
    () => {
        console.log("calling doorUnlock default")
        openwebnet.run("doorUnlock", config.doorUnlock.openSequence, config.doorUnlock.closeSequence)
    })

homekitManager.addSwitch('Muted',
 () => { 
    return openwebnet.run("ringerStatus").then( (result) => {
        if( result == '*#8**33*0##' ) {
            return true
        } else if( result == '*#8**33*1##' ) {
            return false
        }        
    } ) },
 () => { openwebnet.run("ringerMute") },
 () => { openwebnet.run("ringerUnmute").then( () => utils.reloadUi() ) }
)

if( model === 'C300X' ) {
    homekitManager.addSwitch('Voicemail',
    () => {
       return openwebnet.run("aswmStatus").then( result => {
           let matches = [...result.matchAll(/\*#8\*\*40\*([01])\*([01])\*/gm)]
           if( matches && matches.length > 0 && matches[0].length > 0 ) {
               return matches[0][1] == '1'
           }
           return false
       } )
    },
    () => { openwebnet.run("aswmEnable") },
    () => { openwebnet.run("aswmDisable") }
   )    
}

openwebnet.run("firmwareVersion").catch( ()=>{} ).then( (result) => {
    homekitManager.updateFirmwareVersion(result)
})