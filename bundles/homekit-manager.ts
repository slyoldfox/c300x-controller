//
// This file contains an abstraction of all the functionality needed for the intercom to talk to hap-nodejs, the code is restricted to Homekit functionality
// 
// A static homekit-bundle.js is then be generated with $ npm run build:homekitbundle:dev or npm run build:homekitbundle:prod to use it within the c300-controller
//
// This file is subjected to change without backwards compatibility and probably needs heavy refactoring
//

import {Accessory, Bridge, Categories, Characteristic, Service, HAPStorage, uuid, CharacteristicEventTypes, DoorbellController, AudioRecordingCodecType, AudioRecordingSamplerate, AudioStreamingCodecType, AudioStreamingSamplerate, CameraControllerOptions, DoorbellOptions, H264Level, H264Profile, MediaContainerType, SRTPCryptoSuites, VideoCodecType, Resolution, MDNSAdvertiser} from 'hap-nodejs'
import { randomBytes } from 'crypto';
import { StreamingDelegate, VideoConfig } from './homekit-camera';
import { fetchFffmpeg } from './ffmpeg';
import EventBus from '../lib/eventbus';
import { RecordingDelegate } from './homekit-camera-recording';
import { Doorbell } from 'hap-nodejs/dist/lib/definitions';

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
    doorbell: Accessory

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
            advertiser: MDNSAdvertiser.CIAO,
            username: config.username,
            pincode: config.pinCode,
            category: Categories.BRIDGE,
            addIdentifyingMaterial: false
        });  
    }
    addDoorbell(videoConfig: VideoConfig) {
        this.doorbell = new Accessory(videoConfig.displayName, uuid.generate('hap-nodejs:accessories:doorbell:' + videoConfig.displayName));
        setAccessoryInformation(this.doorbell)

        const streamingDelegate = new StreamingDelegate(videoConfig)
        const recordingDelegate = new RecordingDelegate(videoConfig, this.doorbell)
        const motionSensor = this.doorbell.addService(Service.MotionSensor)
        const controller = new DoorbellController(this.getCameraControllerOptions(videoConfig, this.doorbell, streamingDelegate, recordingDelegate));
        
        streamingDelegate.setController( controller )
        recordingDelegate.setController( controller )

        this.doorbell.configureController(controller);

        const doorbellService = this.doorbell.getService(Service.Doorbell);

        this.eventbus.on('homekit:pressed', () => {
            console.log("HOMEKIT PRESSED EVENT AT: " + Date())
            doorbellService.getCharacteristic(Characteristic.ProgrammableSwitchEvent).updateValue(Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS); 
        })

        this.eventbus.on('homekit:motion', (motionTime) => {
            console.log("HOMEKIT MOTION EVENT AT: " + Date())
            motionSensor.getCharacteristic(Characteristic.MotionDetected).updateValue(true);  
            setTimeout( () => {
                console.log("SET FALSE AT: " + Date())
                motionSensor.getCharacteristic(Characteristic.MotionDetected).updateValue(false);  
            }, motionTime || 20000 )
        })        

        this.doorbell.publish({
          advertiser: MDNSAdvertiser.CIAO,
          username: videoConfig.username,
          pincode: videoConfig.pinCode,
          category: Categories.VIDEO_DOORBELL,
        });
        
        console.log('Camera pairing code: ' + videoConfig.pinCode);
        return {
            doorbell: this.doorbell,
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
        setAccessoryInformation(this.doorbell)
        this.bridge.bridgedAccessories.forEach( (accessory) => {
            setAccessoryInformation(accessory)
        } )
    }
    getCameraControllerOptions(videoConfig: VideoConfig, accesorry: Accessory, streamingDelegate : StreamingDelegate, recordingDelegate : RecordingDelegate) {
        const hksv = videoConfig.hksv || true
        const resolutions : Resolution[] = [
          [320, 180, 30],
          [320, 240, 15], // Apple Watch requires this configuration
          [320, 240, 30],
          [480, 270, 30],
          [480, 360, 30],
          [640, 360, 30],
          [640, 480, 30],
          [1280, 720, 30],
          [1280, 960, 30],
          [1920, 1080, 30],
          [1600, 1200, 30]
        ]        
        const options: CameraControllerOptions & DoorbellOptions = {
            cameraStreamCount: videoConfig.maxStreams || 2, // HomeKit requires at least 2 streams, but 1 is also just fine
            delegate: streamingDelegate,
            streamingOptions: {
              supportedCryptoSuites: [SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
              video: {
                resolutions: resolutions,
                codec: {
                  profiles: [H264Profile.BASELINE, H264Profile.MAIN, H264Profile.HIGH],
                  levels: [H264Level.LEVEL3_1, H264Level.LEVEL3_2, H264Level.LEVEL4_0]
                }
              },
              audio: {
                twoWayAudio: !!videoConfig.returnAudioTarget,
                codecs: [
                  {
                    type: AudioStreamingCodecType.AAC_ELD,
                    samplerate: AudioStreamingSamplerate.KHZ_16
                    //type: AudioStreamingCodecType.OPUS,
                    //samplerate: AudioStreamingSamplerate.KHZ_24
                  }
                ]
              }
            },
            recording: hksv
            ? {
              options: {
                prebufferLength: 4000,
                mediaContainerConfiguration: [
                  {
                    type: MediaContainerType.FRAGMENTED_MP4,
                    fragmentLength: 4000,
                  },
                ],
                video: {
                  type: VideoCodecType.H264,
                  parameters: {
                    profiles: [H264Profile.BASELINE, H264Profile.MAIN, H264Profile.HIGH],
                    levels: [H264Level.LEVEL3_1, H264Level.LEVEL3_2, H264Level.LEVEL4_0],
                  },
                  resolutions: resolutions,
                },
                audio: {
                  codecs: {
                    type: AudioRecordingCodecType.AAC_LC,
                    samplerate: AudioRecordingSamplerate.KHZ_24,
                    bitrateMode: 0,
                    audioChannels: 1,
                  },
                },
              },
              delegate: recordingDelegate as RecordingDelegate,
            }
            : undefined,
            sensors: hksv
                ? {
                    motion: accesorry.getService(Service.MotionSensor),
                    occupancy: undefined,
                }
                : undefined,
          };
        return options
    }
}