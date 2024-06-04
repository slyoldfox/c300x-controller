const btAvMedia = require("./bt-av-media")

class OpenwebnetHandler {

    #ignoreVideoStream = false
    #registry
    #api
    #mqtt
    #eventbus
    #btAvMedia = btAvMedia.create()

    constructor(registry, api, mqtt, eventbus) {
        this.#registry = registry
        this.#api = api
        this.#mqtt = mqtt
        this.#eventbus = eventbus
    }

    handle(listener, system, msg) {
        // Uncomment the line below if you wish to debug and view the messages in the console
        //console.log(msg)
        this.#mqtt.dispatch(msg)
        switch (msg) {
            case msg.startsWith('*8*19*') ? msg : undefined:
                this.#mqtt.dispatchMessage(msg)
                this.#mqtt.dispatchLockEvent(msg)
                this.#registry.dispatchEvent('unlocked')
                this.#eventbus.emit('lock:unlocked:' + msg)
                listener.timeLog("Door open requested")
                break
            case msg.startsWith('*8*20*') ? msg : undefined:
                setTimeout(() => {
                    this.#mqtt.dispatchMessage(msg)
                    this.#mqtt.dispatchLockEvent(msg)
                    this.#registry.dispatchEvent('locked')
                    this.#eventbus.emit('lock:locked:' + msg)
                    listener.timeLog("Door closed")
                }, 2000);
                listener.timeLog("Door closed requested")
                break
            case msg.startsWith('*8*1#5#4#') ? msg : undefined:
                listener.timeLog('View doorbell requested')
                this.#mqtt.dispatchMessage(msg)
                this.#ignoreVideoStream = true
                setTimeout(() => {
                    this.#registry.enableStream((ip, audioPort, videoPort) => this.#btAvMedia.addVideoStream(ip, videoPort))
                }, 100);
                break
            case msg.startsWith('*8*1#1#4#') ? msg : undefined:
                this.#eventbus.emit('doorbell:pressed', msg)
                this.#mqtt.dispatchMessage(msg)
                this.#mqtt.dispatchDoorbellEvent(msg)
                this.#registry.dispatchEvent('pressed')
                this.#registry.updateStreamEndpoint('all')
                this.#ignoreVideoStream = false
                listener.timeLog("Incoming call requested, set stream endpoint to 'all'")
                break
            /*
            // Lowres or highres selection is done by the config.highResVideo config variable
            case '*7*300#127#0#0#1#5002#1*##':
                this.#registry.enableStream((ip) => this.#btAvMedia.addVideoStream(ip))
                break
            */
            case '*7*300#127#0#0#1#5007#0*##':
                if (!this.#ignoreVideoStream) {
                    this.#registry.enableStream((ip, audioPort, videoPort) => this.#btAvMedia.addVideoStream(ip, videoPort))
                    console.log("QUEUING AUDIO")
                    setTimeout(() => {
                        console.log("ADDING AUDIO")
                        this.#registry.enableStream((ip, audioPort, videoPort) => this.#btAvMedia.addAudioStream(ip, audioPort))
                        console.log("DONE")
                    }, 300 );
		        }
                else
                    console.log("ignored video stream request (it should already be streaming)")
                break
            case '*7*300#127#0#0#1#5000#2*##':
                this.#registry.enableStream((ip, audioPort, videoPort) => this.#btAvMedia.addAudioStream(ip, audioPort))
                break
            case '*7*73#0#0*##':
                listener.timeLog("Doorbell streams closed")
                break
            case '*7*0*##':
                this.#btAvMedia.cleanup()
                break
            case '*#8**33*0##':
                this.#api.apis.get('/mute').setMuted(true)
                break
            case '*#8**33*1##':
                this.#api.apis.get('/mute').setMuted(false)
                break
            default:
                return false
        }
        return true
    }
}
module.exports = {
    create(registry, api, mqtt, eventbus) {
        return new OpenwebnetHandler(registry, api, mqtt, eventbus)
    }
}
