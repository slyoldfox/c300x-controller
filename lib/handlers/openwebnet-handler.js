const btAvMedia = require("./bt-av-media.js")

class OpenwebnetHandler {
    constructor(registry, api) {
        this.ignoreVideoStream = false
        this.registry = registry
        this.api = api
        this.btAvMedia = btAvMedia.create()
    }

    handle(listener, system, msg) {
        switch (msg) {
            case msg.startsWith('*8*19*') ? msg : undefined:
                this.registry.dispatchEvent('unlocked')
                listener.timeLog("Door open requested")
                break
            case msg.startsWith('*8*20*') ? msg : undefined:
                setTimeout(() => {
                    this.registry.dispatchEvent('locked')
                    listener.timeLog("Door closed")
                }, 2000);
                listener.timeLog("Door closed requested")
                break
            case msg.startsWith('*8*1#5#4#') ? msg : undefined:
                listener.timeLog('View doorbell requested')
                this.ignoreVideoStream = true
                setTimeout(() => {
                    this.registry.enableStream((ipInHashForm) => this.btAvMedia.addHighResVideoStream(ipInHashForm))
                }, 100);
                break
            case msg.startsWith('*8*1#1#4#') ? msg : undefined:
                this.registry.dispatchEvent('pressed')
                this.registry.updateStreamEndpoint('all')
                this.ignoreVideoStream = false
                listener.timeLog("Incoming call requested, set stream endpoint to 'all'")
                break
            case '*7*300#127#0#0#1#5002#1*##':
                this.registry.enableStream((ipInHashForm) => this.btAvMedia.addVideoStream(ipInHashForm))
                break
            case '*7*300#127#0#0#1#5007#0*##':
                if (!this.ignoreVideoStream) {
                    this.registry.enableStream((ipInHashForm) => this.btAvMedia.addHighResVideoStream(ipInHashForm))
                    console.log("QUEUING AUDIO")
                    setTimeout(() => {
                        console.log("ADDING AUDIO")
                        this.registry.enableStream((ipInHashForm) => this.btAvMedia.addAudioStream(ipInHashForm))
                        console.log("DONE")
                    }, 300 );
		        }
                else
                    console.log("ignored video stream request (it should already be streaming)")
                break
            case '*7*300#127#0#0#1#5000#2*##':
                this.registry.enableStream((ipInHashForm) => this.btAvMedia.addAudioStream(ipInHashForm))
                break
            case '*7*73#0#0*##':
                listener.timeLog("Doorbell streams closed")
                break
            case '*#8**33*0##':
                this.api.apis.get('/mute').setMuted(true)
                break
            case '*#8**33*1##':
                this.api.apis.get('/mute').setMuted(false)
                break
            default:
                return false
        }
        return true
    }
}
module.exports = {
    create(registry, api) {
        return new OpenwebnetHandler(registry, api)
    }
}
