const btAvMedia = require("./bt-av-media.js")

class OpenwebnetHandler {
    constructor(registry) {
	this.ignoreVideoStream = false
	this.registry = registry
	this.btAvMedia = btAvMedia.create()
    }

    handle( listener, system, msg ) {
	switch( msg ) {
        case '*8*19*20##':
		        this.registry.dispatchEvent('unlocked')
                listener.timeLog("Door open requested")
                break
        case '*8*20*20##':
            setTimeout( () => {
			    this.registry.dispatchEvent('locked')
                    listener.timeLog("Door closed")
            }, 2000);
            listener.timeLog("Door closed requested")
		    break
	    case '*8*1#5#4#20*10##':
            listener.timeLog('View doorbell requested')
            this.ignoreVideoStream = true
            setTimeout( () => {
                this.registry.enableStream( (ipInHashForm) => this.btAvMedia.addHighResVideoStream(ipInHashForm) )
            }, 100);
		    break
        case '*8*1#1#4#21*10##':
        case '*8*1#1#4#21*11##':
            this.registry.dispatchEvent('pressed')
            this.registry.updateStreamEndpoint( 'all' )
            this.ignoreVideoStream = false
            listener.timeLog("Incoming call requested, set stream endpoint to 'all'")
            break
	    case '*7*300#127#0#0#1#5002#1*##':
            this.registry.enableStream( (ipInHashForm) => this.btAvMedia.addVideoStream(ipInHashForm) )
            break
            case '*7*300#127#0#0#1#5007#0*##':
            if( !this.ignoreVideoStream )
                this.registry.enableStream( (ipInHashForm) => this.btAvMedia.addHighResVideoStream(ipInHashForm) )
            else
                console.log("ignored video stream request (it should already be streaming)")
            break
	    case '*7*300#127#0#0#1#5000#2*##':
            this.registry.enableStream( (ipInHashForm) => this.btAvMedia.addAudioStream(ipInHashForm) )
            break
	    case '*7*73#0#0*##':
            listener.timeLog("Doorbell streams closed")
		    break
	    default:
		return false
	}
	return true
    }
}
module.exports = {
    create(registry) {
	return new OpenwebnetHandler(registry)
    }
}
