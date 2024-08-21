const sipConfig = require('../config').sip
const utils = require('./utils')
const sipbundle = require('./sip/sip-bundle')

let sipOptions = function sipOptions() {
    const model = utils.model()
    const from = sipConfig.from || 'webrtc@127.0.0.1'
    const to = sipConfig.to || (model === 'unknown' ? undefined : model + '@127.0.0.1') // For development, specify the sip.to config value
    const localIp = from?.split(':')[0].split('@')[1]
    const localPort = parseInt(from?.split(':')[1]) || 5060
    const domain = sipConfig.domain || utils.domain() // For development, specify the sip.domain config value
    const expire = sipConfig.expire || 600
    const sipdebug = sipConfig.debug
  
    if (!from || !to || !localIp || !localPort || !domain || !expire ) {
        console.error('Error: SIP From/To/Domain URIs not specified! Current sip config: ')
        console.info(JSON.stringify(sipConfig))
        throw new Error('SIP From/To/Domain URIs not specified!')
    }        
  
    return { 
        from: "sip:" + from,
        //TCP is more reliable for large messages, also see useTcp=true below
        to: "sip:" + to + ";transport=tcp",
        domain: domain,
        expire: Number.parseInt( expire ),
        devaddr: sipConfig.devaddr,
        localIp,
        localPort,
        debugSip: sipdebug,
        gruuInstanceId: '19609c0e-f27b-7595-e9c8269557c4240b',
        useTcp: true
     } 
  }();

class PersistentSipManager {

    #CHECK_INTERVAL = 10 * 1000
    #sipManager
    #lastRegistration = 0
    #expireInterval = 0
    #callPromise
    #sipRequestHandler

    constructor(sipRequestHandler) {
        this.#sipRequestHandler = sipRequestHandler
        sipOptions['sipRequestHandler'] = sipRequestHandler
        setTimeout( () => this.sipManager , 2000 )
    }

    #register() {
        let now = Date.now()
        try {
            sipOptions.debugSip = sipConfig.debug
            if( Number.isNaN( sipOptions.expire ) ||  sipOptions.expire <= 0 || sipOptions.expire > 3600 ) {
                sipOptions.expire = 300
            }
            if( this.#expireInterval === 0 ) {
                this.#expireInterval = (sipOptions.expire * 1000) - 10000
            }     
            if( !this.hasActiveCall && !this.#sipRequestHandler.incomingCallRequest && now - this.#lastRegistration >= this.#expireInterval )  {
                this.#sipManager?.destroy()
                console.log("SIP: Sending REGISTER ...")
                this.#sipManager = new sipbundle.SipManager(console, sipOptions);
                
                this.#sipManager.register().then( () => {
                    console.log("SIP: Registration successful.")
                    this.#lastRegistration = now
                } ).catch( (e) => console.error( "SIP: Registration error: ", e) )
            }

            return this.#sipManager  
        } catch( e ) {
            console.error(e)
            this.#lastRegistration = now + (60 * 1000) - this.#expireInterval
        } finally {
            setTimeout( () => this.#register(), this.#CHECK_INTERVAL )   
        }  
    }

    get hasActiveCall() {
        return this.#callPromise !== undefined
    }

    async call( fn ) {
        return (this.#callPromise || ( this.#callPromise = new Promise((resolve, reject) => {
            fn(resolve, reject)
        }).catch( (e) => { 
            this.#callPromise = undefined            
            console.error("CALL function failed: ", e)
         } )))
    }

    get sipManager() {
        return this.#sipManager || this.#register()
    }

    bye() {
        if( this.#callPromise ) {
            this.#sipManager?.sendBye().catch(console.error).finally( () => {  this.disconnect() } )
        }
    }

    disconnect() {
        this.#callPromise = undefined
    }
}

module.exports = PersistentSipManager