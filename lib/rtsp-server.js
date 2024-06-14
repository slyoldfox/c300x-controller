//
// This file creates an RTSP server which listens on port 6554 on the url rtsp://192.168.0.XX:6554/doorbell
//
// It can be used like this: ffplay rtsp://192.168.0.XX:6554/doorbell
//
// If you are using go2rtc you can use it like this: "ffmpeg:rtsp://192.168.0.XX:6554/doorbell#video=copy#audio=pcma"
//

const sipbundle = require('./sip/sip-bundle')
const sipjs = require('@slyoldfox/sip')
const PersistentSipManager = require('./persistent-sip-manager');
const { ClientServer } = require('rtsp-streaming-server/build/lib/ClientServer');
const { Mounts } = require('rtsp-streaming-server');
const utils = require('./utils')
const debug = utils.getDebugger('rtsp-server');

const audioPort = 10000
const videoPort = 10002
const requestUri = "rtsp://127.0.0.1:6554/doorbell"
const IDENTIFIER = 'webrtc@localhost@127.0.0.1'

const inviteRequestHandler = new class InviteRequestHandler extends sipbundle.SipRequestHandler {

    #incomingCallRequest
    #registry

    handle(request) {
        if( request.method === 'CANCEL' ) {
            let reason = request.headers["reason"] ? ( ' - ' + request.headers["reason"] ) : ''
            console.log('RTSP: CANCEL voice call from: ' + sipjs.stringifyUri( request.headers.from.uri ) + ' to: ' + sipjs.stringifyUri( request.headers.to.uri ) + reason )
            this.#incomingCallRequest = undefined
        }
        if( request.method === 'INVITE' ) {
            console.log("RTSP: INCOMING voice call from: " + sipjs.stringifyUri( request.headers.from.uri ) + ' to: ' + sipjs.stringifyUri( request.headers.to.uri ) )
            this.#incomingCallRequest = request

            // Register a temporary endpoint to dump packets on
            this.#registry.endpoints.set(IDENTIFIER, { lastSeen: Date.now(), videoPort: videoPort, audioPort: audioPort })
            console.log(`RTSP: REGISTERED A TEMPORARY ENDPOINT: VIDEOPORT ${videoPort} / AUDIOPORT ${audioPort}`)

            setTimeout( () => {
                // Assumption that flexisip only holds this call active for 20 seconds ... might be revised
                console.log("RTSP: RESET the incoming call request")
                this.#incomingCallRequest = undefined
                this.#registry.endpoints.delete(IDENTIFIER)
            }, 20 * 1000 )
        }
    }

    get incomingCallRequest() {
        return this.#incomingCallRequest
    }

    setRegistry(registry) {
        this.#registry = registry
    }    
}

const sipCallManager = new PersistentSipManager(inviteRequestHandler)
let clients = 0

module.exports = {
    create(registry) {
        const mounts = new Mounts( {rtpPortStart: audioPort, rtpPortCount: 10000 } )
        const clientServer = new ClientServer(6554, mounts, {
            checkMount: (req) => {
                let m = mounts.getMount(req.uri)
                if( !m ) {
                    // Fail on unknown mount points, only supports /doorbell
                    console.error( `Check mount failed: ${req.uri} !== ${requestUri}` )
                    return false
                }
                    
                debug("new client, current active clients: %s", clients)
                clients++
                debug("new client, current active clients: %s", clients)
                req.socket?.on('close', () => {
                    debug("SOCKET CLOSED: current active clients: %s - %s", clients, req.socket?.session )
                    let client = clientServer.clients[req.socket?.session]
                    if( client ) {
                        client?.close()
                    }
                    clients--
                    if( clients <= 0 && sipCallManager.hasActiveCall ) {
                        console.log("RTSP: SIP: all clients disconnected, sending bye")
                        sipCallManager.bye()
                        sipCallManager.sipManager.onEndedByRemote.subscriptions.length = 0
                    } else {
                        console.log(`RTSP: SIP: not sending bye: number of clients: ${clients} / call active: ${sipCallManager.hasActiveCall}`)
                    }
                })
    
                if( inviteRequestHandler.incomingCallRequest ) {
                    console.log(`RTSP: USING PORTS AUDIO: ${audioPort} / VIDEO: ${videoPort} ====`)
                } else {
                    registry.updateStreamEndpoint('127.0.0.1', audioPort, videoPort) 
                }
    
                if(!sipCallManager.hasActiveCall) {
                            let sipCall = sipCallManager.sipManager.invite( {}, (audio) => {
                                return [
                                    // this SDP is used by the intercom and will send the encrypted packets which we don't care about to the loopback on port 65000 of the intercom
                                    `m=audio 65000 RTP/SAVP 110`,
                                    `a=rtpmap:110 speex/8000`,
                                    `a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:dummykey`,
                                ]
                            }, (video) => {
                                return [
                                    // this SDP is used by the intercom and will send the encrypted packets which we don't care about to the loopback on port 65000 of the intercom
                                    `m=video 65002 RTP/SAVP 96`,
                                    `a=rtpmap:96 H264/90000`,
                                    `a=fmtp:96 profile-level-id=42801F`,
                                    `a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:dummykey`,
                                    'a=recvonly'
                                    ]
                            }, inviteRequestHandler.incomingCallRequest );
            
                            sipCall.then( (sdp) => {
                                sipCallManager.setCallActive(true)
                                sipCallManager.sipManager.onEndedByRemote.subscribe( () => {
                                    sipCallManager.disconnect()
                                    console.log("RTSP: SIP: call ended by Remote ... disconnecting")
                                    for( let id in clientServer.clients ) {
                                        const client = clientServer.clients[id]
                                        if( client ) {
                                            debug('Closing ClientWrapper %s', client.id);
                                            client.close()
                                        }
                                    }
                                    req.socket?.destroy()
                                    console.log("RTSP: SIP: call disonnected.")
                                } )
                            } ).catch( (e) => {
                                console.error(e)
                            } )
                } else {
                    debug("Not calling SIP, is is still active")
                }
                return true
            },
            clientClose: (mount) => {
                debug("RTSP: CLIENT CLOSE: current active clients: %s", clients)
            }
        } )
        clientServer.server.on("request", (req, res) => {
            if(!req.socket?.session && req.headers?.session ) {
                // Save the session id on the socket for cleanup
                req.socket.session = req.headers.session
            }
        })
        clientServer.start().then( () => {
            const sdp = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=No Name\r\nc=IN IP4 127.0.0.1\r\nt=0 0\r\nm=audio 0 RTP/AVP 110\r\na=rtpmap:110 speex/8000\r\na=control:streamid=0\r\nm=video 0 RTP/AVP 96\r\na=rtpmap:96 H264/90000\r\na=control:streamid=1\r\n"
            const mount = mounts.addMount(requestUri, sdp)
            mount.createStream(requestUri + "/streamid=0")
            mount.createStream(requestUri + "/streamid=1")
            mount.setup().catch( (e) => {
                console.error(e)
            } ).then( () => {
                console.log("RTSP: ClientServer is ready.")
            } )
        } )
    }
    
}
        