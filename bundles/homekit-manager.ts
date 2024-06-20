//
// This file contains an abstraction of all the functionality needed for the intercom to talk to hap-nodejs, the code is restricted to Homekit functionality
// 
// A static homekit-bundle.js is then be generated with $ npm run build:homekitbundle:dev or npm run build:homekitbundle:prod to use it within the c300-controller
//
// This file is subjected to change without backwards compatibility and probably needs heavy refactoring
//

import {Accessory, Bridge, Categories, Characteristic, Service, HAPStorage, uuid, CharacteristicEventTypes} from 'hap-nodejs'
import { randomBytes } from 'crypto';
import { StreamingDelegate, VideoConfig } from './homekit-camera';
//import { RecordingDelegate } from './homekit-camera-recording';
import { fetchFffmpeg } from './ffmpeg';
import EventBus from '../lib/eventbus';

const MANUFACTURER = "c300x-controller"
let BUILDNUMBER = "0.0.0"
let FIRMWAREVERSION = "0.0.0"
let MODEL = "C100X/C300X"

function setAccessoryInformation( accessory : Accessory ) {
    const accessoryInformationService = accessory.getService(Service.AccessoryInformation);
    accessoryInformationService.setCharacteristic(Characteristic.Manufacturer, MANUFACTURER);
    accessoryInformationService.setCharacteristic(Characteristic.Model, MODEL);
    accessoryInformationService.setCharacteristic(Characteristic.SerialNumber, 'v' + BUILDNUMBER);
    accessoryInformationService.setCharacteristic(Characteristic.FirmwareRevision, FIRMWAREVERSION);
}

function randomBetween(min, max) {
    return Math.round( Math.random() * (max - min) + min );
}
  
class SwitchAccesory {
    accessory: Accessory;
    switchService: Service;

    constructor(private name : string, private eventbus : EventBus ) {
        const _uuid = uuid.generate('hap-nodejs:accessories:switch:' + name);
        this.accessory = new Accessory(name, _uuid);
        setAccessoryInformation(this.accessory)
        this.switchService = this.accessory.addService(Service.Switch, name);
        this.switchService.getCharacteristic(Characteristic.On)
            .on(CharacteristicEventTypes.SET, (value, callback) => {
                if( value ) {
                    eventbus.emit('homekit:switch:on:' + name, this)
                } else {
                    eventbus.emit('homekit:switch:off:' + name, this)
                }
                callback(null);
            });
            const initialDelay = randomBetween(1000, 10000)
            setTimeout(() => {
                this.#updateSwitchState()
            }, initialDelay)    
    }

    switchedOn( callback : Function ) {
        this.eventbus.on('homekit:switch:on:' + this.name, () => {
            callback(this)
        })        
        return this;
    }

    switchedOff( callback : Function ) {
        this.eventbus.on('homekit:switch:off:' + this.name, () => {
            callback(this)
        })        
        return this;
    }

    updateState( callback : Function ) {
        this.eventbus.on<string>('homekit:switch:update:' + this.name, () => {
            callback().then( (value) => {
                this.switchService.getCharacteristic(Characteristic.On).updateValue(value);
            } ).finally( () => {
                setTimeout( ()=>{
                    this.#updateSwitchState()
                }, 60000 )
            } )
        })
        return this
    }

    #updateSwitchState() {
        this.eventbus.emit('homekit:switch:update:' + this.name)
    }    
}

class LockAccessory {
    #locked : boolean = true
    accessory: Accessory;
    lockService: Service;
    constructor(private id : string, name : string, private eventbus : EventBus) {
        const _uuid = uuid.generate('hap-nodejs:accessories:lock:' + name);
        this.accessory = new Accessory(name, _uuid);
        setAccessoryInformation(this.accessory)
        this.lockService = this.accessory.addService(Service.LockMechanism, name);

        this.lockService
            .getCharacteristic(Characteristic.LockTargetState)
            .on(CharacteristicEventTypes.SET, (value, callback) => {
                if (value === Characteristic.LockTargetState.UNSECURED) {
                  this.#locked = false
                  eventbus.emit('homekit:lock:unlock:' + id, this)
                  callback();

                setTimeout( () => {
                    this.#locked = true
                    eventbus.emit('homekit:lock:lock:' + id, this)
                }, 3000);
                } else if (value === Characteristic.LockTargetState.SECURED) {
                  // Probably shouldn't happen, since the locks auto-secure
                  callback(); 
                  this.lockService.updateCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.SECURED);
                }
            });

        this.lockService
            .getCharacteristic(Characteristic.LockCurrentState)
            .on(CharacteristicEventTypes.GET, callback => {
                if (this.#locked) {
                  callback(undefined, Characteristic.LockCurrentState.SECURED);
                } else {
                  callback(undefined, Characteristic.LockCurrentState.UNSECURED);
                }
            });

        this.lockService.updateCharacteristic(Characteristic.LockTargetState, Characteristic.LockCurrentState.SECURED);
    }

    unlocked( callback : Function ) {
        this.eventbus.on('homekit:lock:unlock:' + this.id, () => {
            callback(this)
        })        
        return this;
    }    
}

export function createHAPUsername() {
    const buffers = [];
    for (let i = 0; i < 6; i++) {
        buffers.push(randomBytes(1).toString('hex'));
    }
    return buffers.join(':');
}

function rd() {
    return Math.round(Math.random() * 100000) % 10;
}

export function randomPinCode() {
    return `${rd()}${rd()}${rd()}-${rd()}${rd()}-${rd()}${rd()}${rd()}`;
}

export class HomekitManager {
    bridge: Bridge

    constructor( private eventbus : EventBus, base_path : string, config, videoConfig: VideoConfig, buildNumber : string, model : string) {
        HAPStorage.setCustomStoragePath( base_path + "/storage")
        if( !videoConfig.videoProcessor ) {
            videoConfig.$internalVideoProcessor = fetchFffmpeg(base_path)
        }
        MODEL = model
        BUILDNUMBER = buildNumber
        this.bridge = new Bridge(config.displayName, uuid.generate('hap-nodejs:bridges:homebridge'));
        setAccessoryInformation(this.bridge)
        console.log("Bridge pairing code: " + config.pinCode)

        this.bridge.publish({
            username: config.username,
            pincode: config.pinCode,
            category: Categories.BRIDGE,
            addIdentifyingMaterial: false
        });  
    }
    addDoorbell(videoConfig: VideoConfig) {
        const accessory = new Accessory(videoConfig.displayName, uuid.generate('hap-nodejs:accessories:doorbell:' + videoConfig.displayName));
        setAccessoryInformation(accessory)

        const streamingDelegate = new StreamingDelegate(videoConfig)
        //TODO: HKSV
        //const recordingDelegate = new RecordingDelegate()

        accessory.configureController(streamingDelegate.controller);

        this.eventbus.on('homekit:pressed', () => {
            console.log("HOMEKIT PRESSED EVENT")
            const doorbellService = accessory.getService(Service.Doorbell);
            doorbellService.getCharacteristic(Characteristic.ProgrammableSwitchEvent).updateValue(Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);  
        })

        accessory.publish({
          username: videoConfig.username,
          pincode: videoConfig.pinCode,
          category: Categories.VIDEO_DOORBELL,
        });
        
        console.log('Camera pairing code: ' + videoConfig.pinCode);
        return {
            doorbell: accessory,
            streamingDelegate
        }
    }
    addLock(id: string, name: string ) {
        const lock = new LockAccessory(id, name, this.eventbus);
       
        this.eventbus.on('homekit:locked:' + id, (value) => {
            if( value === true ) {
                lock.lockService.updateCharacteristic(Characteristic.LockCurrentState, Characteristic.LockTargetState.SECURED);  
                lock.lockService.updateCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED); 
            } else if( value === false ) {
                lock.lockService.updateCharacteristic(Characteristic.LockCurrentState, Characteristic.LockTargetState.UNSECURED);
                lock.lockService.updateCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.UNSECURED); 
            }  
        })

        this.bridge.addBridgedAccessory(lock.accessory);  
        return lock
    }
    addSwitch(name: string) {
        const accessory = new SwitchAccesory(name, this.eventbus );
        this.bridge.addBridgedAccessory(accessory.accessory);  
        return accessory
    }    
    updateFirmwareVersion(version) {
        FIRMWAREVERSION = version
        setAccessoryInformation(this.bridge)
        this.bridge.bridgedAccessories.forEach( (accessory) => {
            setAccessoryInformation(accessory)
        } )
    }
}