import {Accessory, Bridge, CameraController, Categories, Characteristic, Service, HAPStorage, uuid, CharacteristicEventTypes} from 'hap-nodejs'
import { randomBytes } from 'crypto';
const { spawn } = require('child_process');

HAPStorage.setCustomStoragePath( __dirname + "/storage")

const MANUFACTURER = "c300x-controller"
let BUILDNUMBER = "0.0.0"
let FIRMWAREVERSION = "0.0.0"
let MODEL = "C100X/C300X"

function setAccessoryInformation( accessory ) {
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
    name: string;
    uuid: string;
    accessory: Accessory;
    switchService: Service;
    onFunction: Function
    offFunction: Function
    pollerFunction: Function

    constructor(name, pollerFunction : Function, onFunction : Function, offFunction : Function ) {
        this.name = name;
        this.onFunction = onFunction
        this.offFunction = offFunction
        this.pollerFunction = pollerFunction
        this.uuid = uuid.generate('hap-nodejs:accessories:switch:' + name);
        this.accessory = new Accessory(name, this.uuid);
        this.switchService = this.accessory.addService(Service.Switch, name);
        this.switchService.getCharacteristic(Characteristic.On)
            .on(CharacteristicEventTypes.SET, (value, callback) => {
                if( value ) {
                    this.onFunction()
                } else {
                    this.offFunction()
                }
                //console.log('Switch state changed to:', value ? 'ON' : 'OFF');
                callback(null);
            });
            if( this.pollerFunction ) {
                const initialDelay = randomBetween(500, 5000)
                setTimeout(() => {
                    this.updateSwitchState()
                }, initialDelay)    
            }

    }

    updateSwitchState() {
        this.pollerFunction().then( (value) => {
            this.switchService.getCharacteristic(Characteristic.On).updateValue(value);
        } ).finally( () => {
            setTimeout( ()=>{
                this.updateSwitchState()
            }, 60000 )
        } )
    }    
}

class LockAccessory {
    locked : boolean = true
    name: string;
    uuid: string;
    unlockFunction
    lockFunction
    accessory: any;
    lockService: any;
    constructor(name, unlockFunction, lockFunction) {
        this.name = name;
        this.unlockFunction = unlockFunction
        this.lockFunction = lockFunction

        // Generate a unique identifier for the accessory
        this.uuid = uuid.generate('hap-nodejs:accessories:lock:' + name);

        // Create the accessory
        this.accessory = new Accessory(name, this.uuid);
        setAccessoryInformation(this.accessory,)

        // Add the lock service to the accessory
        this.lockService = this.accessory.addService(Service.LockMechanism, name);

        // Configure the lock service
        this.lockService
            .getCharacteristic(Characteristic.LockTargetState)
            .on(CharacteristicEventTypes.SET, (value, callback) => {
                if (value === Characteristic.LockTargetState.UNSECURED) {
                  this.locked = false
                  this.unlockFunction()
                  callback(); // Our fake Lock is synchronous - this value has been successfully set
            
                  // now we want to set our lock's "actual state" to be unsecured so it shows as unlocked in iOS apps
                  this.lockService.updateCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.UNSECURED);

                  setTimeout( () => {
                    this.locked = true
                    if( this.lockFunction )
                        this.lockFunction()
                    this.lockService.updateCharacteristic(Characteristic.LockCurrentState, Characteristic.LockTargetState.SECURED);  
                    this.lockService.updateCharacteristic(Characteristic.LockTargetState, Characteristic.LockTargetState.SECURED);                    
                
                }, 3000);
                } else if (value === Characteristic.LockTargetState.SECURED) {
                  // Probably shouldn't happen
                  callback(); 
                  this.lockService.updateCharacteristic(Characteristic.LockCurrentState, Characteristic.LockCurrentState.SECURED);
                }
              });
        this.lockService
            .getCharacteristic(Characteristic.LockCurrentState)
            .on(CharacteristicEventTypes.GET, callback => {
                if (this.locked) {
                  //console.log("Are we locked? Yes.");
                  callback(undefined, Characteristic.LockCurrentState.SECURED);
                } else {
                  //console.log("Are we locked? No.");
                  callback(undefined, Characteristic.LockCurrentState.UNSECURED);
                }
              });

        this.lockService.updateCharacteristic(Characteristic.LockTargetState, Characteristic.LockCurrentState.SECURED);
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
    constructor(config, buildNumber, model) {
        MODEL = model
        BUILDNUMBER = buildNumber
        this.bridge = new Bridge(config.displayName, uuid.generate('hap-nodejs:bridges:homebridge'));
        setAccessoryInformation(this.bridge)
        console.log("Bridge pin code: " + config.pinCode)

        this.bridge.publish({
            username: config.username,
            pincode: config.pinCode,
            category: Categories.BRIDGE,
            addIdentifyingMaterial: false
        });  
        this.bridge._server.on('listening', (port) => {
            console.log('Accessory is bound to port:', port);
        });
    }
    addLock(name: string, unlockFunction, lockFunction ) {
        const lock = new LockAccessory(name, unlockFunction, lockFunction);
        this.bridge.addBridgedAccessory(lock.accessory);           
    }
    addSwitch(name: string, pollerFunction : Function, onFunction : Function, offFunction : Function,  ) {
        const accessory = new SwitchAccesory(name, pollerFunction, onFunction, offFunction );
        setAccessoryInformation(accessory.accessory)
        this.bridge.addBridgedAccessory(accessory.accessory);           
    }    
    updateFirmwareVersion(version) {
        FIRMWAREVERSION = version
        setAccessoryInformation(this.bridge)
        this.bridge.bridgedAccessories.forEach( (a) => {
            setAccessoryInformation(a)
        } )
    }
}
