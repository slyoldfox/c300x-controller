//
// This file creates an RTSP server which listens on port 6554 on the url rtsp://192.168.0.XX:6554/doorbell
//
// It can be used like this: ffplay rtsp://192.168.0.XX:6554/doorbell
//
// If you are using go2rtc you can use it like this: "ffmpeg:rtsp://192.168.0.XX:6554/doorbell#video=copy#audio=pcma"
// echo 419430 > /proc/sys/net/core/rmem_max

const sipjs = require('@slyoldfox/sip')
const PersistentSipManager = require('./persistent-sip-manager');
const { ClientServer } = require('@slyoldfox/rtsp-streaming-server/build/lib/ClientServer');
const { Mounts, Mount } = require('@slyoldfox/rtsp-streaming-server');
const utils = require('./utils')
const debug = utils.getDebugger('rtsp-server');

const audioPort = 10000
const videoPort = 10002
const requestUri = "rtsp://127.0.0.1:6554/doorbell"
const IDENTIFIER = 'webrtc@localhost@127.0.0.1'

class InviteRequestHandler {

    #incomingCallRequest
    #registry
    #eventbus
    #resetHandler

    constructor(registry, eventbus) {
        this.#registry = registry
        this.#eventbus = eventbus
    }

    resetIncomingCallRequest() {
        console.log("RTSP: RESET the incoming call request")
        if(this.#resetHandler) {
            // This shouldn't happen, but in case a second INVITE comes in, cancel the previous reset handler
            clearTimeout(this.#resetHandler)
        }            
        this.#incomingCallRequest = undefined
        this.#registry.endpoints.delete(IDENTIFIER)
    }

    handle(request) {
        if( request.method === 'CANCEL' ) {
            const reason = request.headers["reason"] ? ( ' - ' + request.headers["reason"] ) : ''
            console.log('RTSP: CANCEL voice call from: ' + sipjs.stringifyUri( request.headers.from.uri ) + ' to: ' + sipjs.stringifyUri( request.headers.to.uri ) + reason )
            this.resetIncomingCallRequest()
        }
        if( request.method === 'INVITE' ) {
            console.log("RTSP: INCOMING voice call from: " + sipjs.stringifyUri( request.headers.from.uri ) + ' to: ' + sipjs.stringifyUri( request.headers.to.uri ) )
            this.#incomingCallRequest = request
            this.#eventbus.emit('homekit:pressed')

            // Register a temporary endpoint to dump packets on
            this.#registry.endpoints.set(IDENTIFIER, { lastSeen: Date.now(), videoPort: videoPort, audioPort: audioPort })
            console.log(`RTSP: REGISTERED A TEMPORARY ENDPOINT: VIDEOPORT ${videoPort} / AUDIOPORT ${audioPort}`)

            if(this.#resetHandler) {
                // This shouldn't happen, but in case a second INVITE comes in, cancel the previous reset handler
                clearTimeout(this.#resetHandler)
            }

            this.#resetHandler = setTimeout( () => {
                this.resetIncomingCallRequest()
            }, 60 * 1000 )
        }
    }

    get incomingCallRequest() {
        return this.#incomingCallRequest
    }
}

class ClientServerHandler {

    #inviteRequestHandler
    #sipCallManager
    #registry
    #lastCalled = undefined
    #checkHandler = undefined
    #sockets = new Set();

    constructor(registry, eventbus) {
        this.#registry = registry
        this.#inviteRequestHandler = new InviteRequestHandler(registry, eventbus)
        this.#sipCallManager = new PersistentSipManager(this.#inviteRequestHandler)
    }
    
    checkKillHandler() {
        if( !this.#checkHandler ) {
            this.#checkHandler = setTimeout( () => {
                this.checkKillHandler()
            }, 1000 )
        } else {
            if( this.#lastCalled ) {
                // Keep the stream alive for about 7 seconds after disconnect, allowing clients to resume faster
                // TODO: make this value configurable?
                if( Date.now() - this.#lastCalled > 7500 ) {
                    console.log("RTSP: killhandler stopped.")
                    this.#lastCalled = undefined
                    clearTimeout(this.#checkHandler)
                    this.#checkHandler = undefined
                    //TODO: there is a race condition when bye() is being handled and a new client request comes in
                    this.#sipCallManager.bye()
                    this.#sipCallManager.sipManager.onEndedByRemote.subscriptions.length = 0
                } else {
                    debug("RTSP: killhandler: RESCHEDULING SIP BYE...")
                    this.#checkHandler = setTimeout( () => {
                        this.checkKillHandler()
                    }, 1000 )
                }
            } else {
                debug("RTSP: killhandler: lastCalled is NOT set")
            }
        }
    }
    createClientServer(mounts) {
        const clientServer = new ClientServer(6554, mounts, {
            checkMount: (req) => {
                this.#lastCalled = undefined
                clearTimeout(this.#checkHandler)
                console.log("CHECKMOUNT CALLED: " + req.uri)
                const m = mounts.getMount(req.uri)
                if (!m) {
                    // Fail on unknown mount points, only supports /doorbell and /doorbell-video uri
                    console.error(`Check mount failed: ${req.uri} !== ${requestUri}`)
                    return false
                }

                debug("new client, current active clients: %s", clientServer.server._connections)
                req.socket?.on('close', () => {
                    this.#lastCalled = Date.now()
                    debug("SOCKET CLOSED: current active clients: %s - %s", clientServer.server._connections, req.socket?.session)
                    const client = clientServer.clients[req.socket?.session]
                    if (client) {
                        client?.close()
                    }

                    if (clientServer.server._connections <= 0 && this.#sipCallManager.hasActiveCall) {
                        console.log("RTSP: SIP: all clients disconnected, starting kill handler.")
                        this.checkKillHandler()
                    } else {
                        console.log(`RTSP: SIP: not sending bye: number of clients: ${clientServer.server._connections} / call active: ${this.#sipCallManager.hasActiveCall}`)
                    }
                })

                if (this.#inviteRequestHandler.incomingCallRequest) {
                    console.log(`RTSP: USING PORTS AUDIO: ${audioPort} / VIDEO: ${videoPort} ====`)
                } else {
                    this.#registry.updateStreamEndpoint('127.0.0.1', audioPort, videoPort)
                }

                const endpointWithoutSip = req.uri.toString().indexOf("/doorbell-video") >= 0 || req.uri.toString().indexOf("/doorbell-recorder") >= 0
                const needsSipCall = (this.#inviteRequestHandler.incomingCallRequest && !endpointWithoutSip) || !this.#inviteRequestHandler.incomingCallRequest

                if (!needsSipCall) {
                    // If we are request a snapshot of the videostream, we don't need to setup a call if it's an incoming call
                    debug(`RTSP: NOT needing SIP call endpointWithoutSip? ${endpointWithoutSip} / incomingCallRequest: ${this.#inviteRequestHandler.incomingCallRequest}`)
                    return true
                } else {
                    debug(`RTSP: NEEDING SIP call endpointWithoutSip? ${endpointWithoutSip} / incomingCallRequest: ${this.#inviteRequestHandler.incomingCallRequest}`)
                }

                if (!this.#sipCallManager.hasActiveCall) {
                    debug("RTSP: SIP: calling or continuing concurrently...")
                    this.#sipCallManager.call((resolve, reject) => {
                        // We don't actually need to wait for the call to complete, the RTSP client can continue its SETUP phase while SIP connects and sets up the streams
                        const sipCall = this.#sipCallManager.sipManager.invite({}, (audio) => {
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
                        }, this.#inviteRequestHandler.incomingCallRequest);

                        sipCall.then((sdp) => {
                            debug("RTSP: SIP: RESOLVED")
                            if(this.#inviteRequestHandler.incomingCallRequest) {
                                this.#inviteRequestHandler.resetIncomingCallRequest()
                            }

                            resolve()
                            this.#sipCallManager.sipManager.onEndedByRemote.subscribe(() => {
                                this.#sipCallManager.disconnect()
                                this.#lastCalled = undefined
                                if(this.#checkHandler) clearTimeout(this.#checkHandler)
                                
                                console.log("RTSP: SIP: call ended by Remote ... disconnecting")
                                for (let id in clientServer.clients) {
                                    const client = clientServer.clients[id]
                                    if (client) {
                                        debug('Closing ClientWrapper %s', client.id);
                                        client.close()
                                    }
                                }
                                this.closeAllSockets()
                                
                                console.log("RTSP: SIP: call disonnected.")
                            })
                        }).catch((e) => {
                            this.#sipCallManager.disconnect()
                            console.error(e)
                            reject()
                        })
                    })
                } else {
                    debug("Not calling SIP, it is still active")
                }
                debug("RTSP: SIP: call connected")
                return true
            },
            clientClose: (mount) => {
                debug("RTSP: CLIENT CLOSE: current active clients: %s", clientServer.server._connections)
            }
        })
        clientServer.server.on("connection", socket => {
            this.#sockets.add(socket);
            socket.on("close", () => {
                this.#sockets.delete(socket);
            });
        });        
        return clientServer;
    }
    closeAllSockets() {
        for (const socket of this.#sockets.values()) {
            socket?.destroy();
        }
    }    
}

module.exports = {
    create(registry,eventbus) {
        const mounts = new Mounts( {rtpPortStart: audioPort, rtpPortCount: 10000 } )
        const clientServer = new ClientServerHandler(registry, eventbus).createClientServer(mounts);

        clientServer.server.on("request", (req, res) => {
            if(!req.socket?.session && req.headers?.session ) {
                // Save the session id on the socket for cleanup
                req.socket.session = req.headers.session
            }
        })

        clientServer.start().then( () => {
            // Add a mount with audio (port 10000) and video (port 10002), order of calling createStream is important here!
            const sdp = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=No Name\r\nc=IN IP4 127.0.0.1\r\nt=0 0\r\nm=audio 0 RTP/AVP 110\r\na=rtpmap:110 speex/8000\r\na=control:streamid=0\r\nm=video 0 RTP/AVP 96\r\na=rtpmap:96 H264/90000\r\na=control:streamid=1\r\n"
            const mount = mounts.addMount(requestUri, sdp)
            const clientLeave = mount.clientLeave 
            mount.clientLeave = (client) => {
                if(client.stream) {
                    //TODO: Don't fail internally when stream is not set, may not occur anymore
                    clientLeave.apply(mount, [client])
                } else {
                    console.log("!!!!!!!!! RTSP: cannot call clientLeave() because client.stream is undefined and would cause issues. !!!!!!!!")
                }
            }
            const audioStream = mount.createStream(requestUri + "/streamid=0")
            const videoStream = mount.createStream(requestUri + "/streamid=1")
            mount.setup().catch( (e) => {
                console.error(e)
            } ).then( () => {
                console.log("RTSP: ClientServer is ready.")
            } )

            // Add a video only stream by adding a new mount with the same stream reference from the original mount
            const sdpvideo = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=No Name\r\nc=IN IP4 127.0.0.1\r\nt=0 0\r\nm=video 0 RTP/AVP 96\r\na=rtpmap:96 H264/90000\r\na=control:streamid=1\r\n"
            const videoOnlyMount = new Mount(mounts, "/doorbell-video", sdpvideo, mount.hooks)
            videoOnlyMount.streams[videoStream.id] = videoStream
            mounts.mounts["/doorbell-video"] = videoOnlyMount

            // Adds a recording only stream
            const recordingMount = new Mount(mounts, "/doorbell-recorder", sdp, mount.hooks)
            recordingMount.streams[audioStream.id] = audioStream
            recordingMount.streams[videoStream.id] = videoStream
            mounts.mounts["/doorbell-recorder"] = recordingMount
        } )
    }
}
        