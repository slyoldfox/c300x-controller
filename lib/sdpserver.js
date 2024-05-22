const sipbundle = require('./sip/sip-bundle')
const sipjs = require('@slyoldfox/sip')
const PersistentSipManager = require('./persistent-sip-manager')

const net = require("net");

function sdp(audioPort, videoPort) {
    return `v=0
m=audio ${audioPort} RTP/AVP 110
c=IN IP4 127.0.0.1
a=rtpmap:110 speex/8000/1
m=video ${videoPort} RTP/AVP 96
c=IN IP4 127.0.0.1
a=rtpmap:96 H264/90000`
}

const inviteRequestHandler = new class InviteRequestHandler extends sipbundle.SipRequestHandler {

    #incomingCallRequest

    handle(request) {
        if( request.method == 'CANCEL' ) {
            let reason = request.headers["reason"] ? ( ' - ' + request.headers["reason"] ) : ''
            console.log('CANCEL voice call from: ' + sipjs.stringifyUri( request.headers.from.uri ) + ' to: ' + sipjs.stringifyUri( request.headers.to.uri ) + reason )
            this.#incomingCallRequest = undefined
        }
        if( request.method === 'INVITE' ) {
            console.log("INCOMING voice call from: " + sipjs.stringifyUri( request.headers.from.uri ) + ' to: ' + sipjs.stringifyUri( request.headers.to.uri ) )
            this.#incomingCallRequest = request

            setTimeout( () => {
                // Assumption that flexisip only holds this call active for 20 seconds ... might be revised
                console.log("RESET the incoming call request")
                this.#incomingCallRequest = undefined
            }, 20 * 1000 )
        }
    }

    get incomingCallRequest() {
        return this.#incomingCallRequest
    }
}

const sipCallManager = new PersistentSipManager(inviteRequestHandler)

function randomUdpPort(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

module.exports = {
    create(registry) {
        const server = net.createServer( (client) => {
            client.on('close', () => {
                console.log("DISCONNECTED client: " + client.remoteAddress + ':' + client.remotePort);
                if( sipCallManager.hasActiveCall ) {
                    console.log("SIP: has active call, sending bye")
                    sipCallManager.bye()
                }
                sipCallManager.sipManager.onEndedByRemote.subscriptions.length = 0
            })
            console.log("server connections: " + server._connections);

            const audioPort = randomUdpPort(50000, 65000)
            const videoPort = randomUdpPort(50000, 65000)
            const sdpresult = sdp(audioPort, videoPort)
            registry.updateStreamEndpoint(client.remoteAddress, audioPort, videoPort)

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
            sipCall.then( (sdpd) => {
                sipCallManager.setCallActive(true)
                sipCallManager.sipManager.onEndedByRemote.subscribe( () => {
                    sipCallManager.disconnect()
                    console.log("SIP: call ended by Remote ... disconnecting")
                    client.destroy()
                    console.log("SIP: call disonnected.")
                } )                     
                client.write(sdpresult)
                client.end()
            } ).catch( (e) => {
                console.error(e)
                client.destroy()
            } )
        } ); 

        server.on("listening", () => {
            console.log(`SDP server listening on ${server.address().address}:${server.address().port}`)
        })

        // ffplay -protocol_whitelist file,http,https,tcp,tls,crypto,rtp,udp -f sdp -i tcp://127.0.0.1:8081
        server.listen(8081, "0.0.0.0");
    }
}
