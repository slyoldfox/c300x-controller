# c300x-controller: The API that BTicino never had

## Table of Contents

- [Support](#support)
- [API](#api)
- [Handlers](#handlers)
- [Setup procedure](#setup-procedure)
- [WebRTC](#webrtc)
- [Homekit](#homekit)
- [Home Assistant webhooks and endpoints](#home-assistant-webhooks-and-endpoints)
- [Development](#development)

## Support

I have put many hours of research in the BTicino intercom.

Many people have been asking me if they can send me some hardware to show their support.

If you want to support me, have a look at my [Amazon wishlist](https://www.amazon.de/registries/gl/guest-view/2S9AZ0FONMSK9?language=en_GB&currency=EUR) ❤️🙏 and buy anything (or nothing) you see there.

## API

Supports:

* Unlocking door (supporting multiple locks)
* Displaying the unit temp and load
* Rebooting the unit
* Register endpoints to receive doorbell pressed, door locked and door unlocked events
* Enable/disable voice mail and show the status
* Enable/disable the ringer and show the status
* Start dropbear sshd (in case it crashes)
* Validates scrypted setup
* Exposes the voicemail videoclips
* Display the videoclip
* HA proxy for custom UI dashboards (see https://github.com/slyoldfox/c300x-dashboard)
* Send MQTT messages for openwebnet events and intercom status
* WebRTC bundle with embedded SIP client and RTSP server
* Homekit bundle with support for locks, voicemail and muting intercom, doorbell
* HKSV (Homekit Secure Video) recordings on doorbell events and motion events

## Handlers

Handlers automatically act on syslog messages being sent on the multicast port 7667.
They are handled by `multicast-listener.js`. At the moment only 1 handler is registered which listens to the `openwebnet` messages.

## Setup procedure

You can choose between an automated install using a script or a manual install.

### Automated install

You can execute the `install.sh` script which will do all manual steps below for you:

```
bash -c "$(wget -qO - 'https://raw.githubusercontent.com/slyoldfox/c300x-controller/main/install.sh')"
```

Or if you rather first fetch the script and read it before executing:

```
wget 'https://raw.githubusercontent.com/slyoldfox/c300x-controller/main/install.sh'
less install.sh
bash install.sh
```

### Manual install

#### 1. Install `node.js`
```
mount -oremount,rw /
cd /home/bticino/cfg/extra/
mkdir node
wget https://nodejs.org/download/release/latest-v17.x/node-v17.9.1-linux-armv7l.tar.gz
tar xvfz node-v17.9.1-linux-armv7l.tar.gz --strip-components 1 -C ./node
rm node-v17.9.1-linux-armv7l.tar.gz
```

#### 2. Install `libatomic.so.1`

Node will require libatomic.so.1 which isn't shipped with the device, so we need to collect it from another source.

> [!IMPORTANT] 
> It's strongly advised to do this step on a different Linux machine, because C300x misses XZ Utils to decompress archives contained in the deb package

```
cd /tmp
wget http://ftp.de.debian.org/debian/pool/main/g/gcc-10-cross/libatomic1-armhf-cross_10.2.1-6cross1_all.deb
ar x libatomic1-armhf-cross_10.2.1-6cross1_all.deb
tar -xf data.tar.xz
cd usr/arm-linux-gnueabihf/lib/
```

Now you should find `libatomic.so.1.2.0` lib binary. Transfer it to the intercom, to the `/lib` folder, than create the library symlink

```
cd /lib
ln -s libatomic.so.1.2.0 libatomic.so.1
```

#### 3. Check that `node.js` now works fine

```
/home/bticino/cfg/extra/node/bin/node -v
```
should output the version
```
v17.9.1
```

#### 4. Install `c300x-controller`

```
cd /home/bticino/cfg/extra/
mkdir c300x-controller
cd c300x-controller
wget https://github.com/slyoldfox/c300x-controller/releases/latest/download/bundle.js -O /home/bticino/cfg/extra/c300x-controller/bundle.js 
# if using webrtc
wget https://github.com/slyoldfox/c300x-controller/releases/latest/download/bundle-webrtc.js -O /home/bticino/cfg/extra/c300x-controller/bundle.js 
# if using homekit
wget https://github.com/slyoldfox/c300x-controller/releases/latest/download/bundle-homekit.js -O /home/bticino/cfg/extra/c300x-controller/bundle.js 
```

now do a check run

```
/home/bticino/cfg/extra/node/bin/node /home/bticino/cfg/extra/c300x-controller/bundle.js
```

#### 5. Edit firewall rules

To be able to access the c300x-controller from the network, you have to allow incoming connections through the wireless interface to port 8080.
Edit `/etc/network/if-pre-up.d/iptables` and add the following section at line 38:

```
# c300x-controller
for i in 8080; do
	iptables -A INPUT -p tcp -m tcp --dport $i -j ACCEPT
	iptables -A INPUT -p tcp -m tcp --sport $i -j ACCEPT
done
```

then apply changes

```
/etc/init.d/networking restart
```

and check that the controller is now reachable at http://<your_device_ip>:8080

> [!WARNING]
> If you prefer, at your own risk, you can entirely disable iptables firewall
> 
> ```
> $ mv /etc/network/if-pre-up.d/iptables /home/bticino/cfg/extra/iptables.bak
> $ mv /etc/network/if-pre-up.d/iptables6 /home/bticino/cfg/extra/iptables6.bak
> ```

#### 6. Running it at startup

Create a new init.d script under `/etc/init.d/c300x-controller` with the following content
```
#! /bin/sh

### BEGIN INIT INFO
# Provides:         c300x-controller
# Default-Start:    2 3 4 5
# Default-Stop:     0 1 6
# Short-Description:    c300x-controller
### END INIT INFO

set -e

PIDFILE=/var/run/c300x-controller
DAEMON="/home/bticino/cfg/extra/node/bin/node"
DAEMON_ARGS="/home/bticino/cfg/extra/c300x-controller/bundle.js"

. /etc/init.d/functions

case "$1" in
    start)
        echo "Starting c300x-controller"
		if start-stop-daemon --start --quiet --oknodo --background  --make-pidfile --pidfile ${PIDFILE} --exec ${DAEMON} -- ${DAEMON_ARGS} ; then
			exit 0
		fi
        ;;

    stop)
        echo "Stopping c300x-controller"
        if start-stop-daemon --stop --quiet --oknodo --pidfile ${PIDFILE} --retry=TERM/3/KILL/2; then
            rm -f ${PIDFILE}
            exit 0
        fi
        ;;

    restart)
        echo "Restarting c300x-controller"
        if start-stop-daemon --stop --quiet --oknodo --retry 30 --pidfile ${PIDFILE}; then
            rm -f ${PIDFILE}
        fi
	usleep 150000 
        if start-stop-daemon --start --quiet --oknodo --background --make-pidfile --pidfile ${PIDFILE} --retry=TERM/3/KILL/2 --exec ${DAEMON} -- ${DAEMON_ARGS} ; then
            exit 0
        fi
        ;;

    status)
        #status ${DAEMON} && exit 0 || exit $?
        pid=`ps -fC node | grep "$DAEMON $DAEMON_ARGS" | awk '{print $2}'`
        if [ "$pid" != "" ]; then
                echo "$DAEMON $DAEMON_ARGS (pid $pid) is running..."
        else
                echo "$DAEMON $DAEMON_ARGS stopped"
        fi
        ;;

    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
esac

exit 0
```

make it executable

```
chmod 755 /etc/init.d/c300x-controller
```

then create the symlink for init.d runlevel 5

```
cd /etc/rc5.d/
ln -s ../init.d/c300x-controller S40c300x-controller
```

#### 7. Final steps

Make the filesystem read-only again

```
mount -oremount,ro /
```

than reboot the unit and verify that everything is working as expected.

## WebRTC

Since version 2024.5.1 - you can choose between `bundle.js`, `bundle-webrtc.js` or `bundle-homekit.js`.

To use `WebRTC`,  use the `bundle-webrtc.js` file instead of the `bundle.js`.

In config.json add the following config:

```
    "sip" : {
        "from": "webrtc@127.0.0.1",
        "to": "c300x@192.168.0.XX",
        "domain": "XXXXXXX.bs.iotleg.com",
        "debug": false
    }
```

Add the `webrtc` to the linphone files if you wish to receive incoming calls.

When starting the WebRTC bundle, an additional RTSP server will be available at `rtsp://192.168.0.X:6554/doorbell`.

This allows you to use `ffplay -f rtsp -i rtsp://192.168.0.X:6554/doorbell` or `ffmpeg -f rtsp -i rtsp://192.168.0.X:6554/doorbell` to setup the underlying SIP call and view the camera.

There is also two more endpoints:

* `rtsp://192.168.0.X:6554/doorbell-video` is a video only stream (no audio)
* `rtsp://192.168.0.X:6554/doorbell-recorder` is used internally for HKSV recordings

You can use the Home Assistant add-on or integration at https://github.com/AlexxIT/WebRTC to add a WebRTC card to your dashboard.

The Home Assistant add-on or integration has the ability to run https://github.com/AlexxIT/go2rtc as an embedded process on your HA instance (or as a standalone process).

You can add a stream to the Bticino intercom by specifying the following `go2rtc.yaml`

```
streams:
  doorbell:
    - "ffmpeg:rtsp://192.168.0.XX:6554/doorbell#video=copy#audio=pcma"    
    - "exec:ffmpeg -re -fflags nobuffer -f alaw -ar 8000 -i - -ar 8000 -acodec speex -f rtp -payload_type 97 rtp://192.168.0.XX:40004#backchannel=1"
```

The `ffmpeg:rtsp://192.168.0.XX:6554/doorbell#video=copy#audio=pcma"` line talks to the RTSP server inside the c300-controller and will setup a SIP call in the background.

The options `#video=copy#audio=pcma` tell go2rtc to copy the `h264` and transcode the audio (from `speex`) to `pcma`

The `exec:ffmpeg ...` line specifies the `backchannel`. This is the stream from your (browser) microphone towards the intercom.
It will read the microphone data from the websocket and transcode it to `speex` and send it the intercom using `rtp`. The port `40004` is the port of the UDP proxy inside the c300-controller.

In `go2rtc.yaml` you might also want to configure the location of the `ffmpeg` binary if you need a more recent version.
Be aware that some `ffmpeg` binaries don't support the `speex` library.

```
ffmpeg:
  bin: /home/hass/ffmpeg-linux-x64  # path to ffmpeg binary
```

The WebRTC card configuration looks like this:

```
type: custom:webrtc-camera
url: doorbell
mode: webrtc
media: video,audio,microphone
```

To use the microphone you must make sure that your Home Assistant instance is running on `https://`. The microphone does not activate on `http://`, this is a browser security measure.

If you managed to get this working on your local network, you will still need to fix something to make sure you can reach the stream from the internet.

Have a look at https://github.com/AlexxIT/go2rtc?tab=readme-ov-file#module-webrtc for this.

In my case I forwarded port `8555` to my internal go2rtc instance and specified my IP in the `candidates` section in `go2rtc.yaml`

```
webrtc:
  candidates:
    - 216.58.210.174:8555  # if you have static public IP-address
```
_BONUS:_

If you don't wish to run the `go2rtc` embedded process in HA, you can run it natively on your intercom:

Fetch the binaries for go2rtc and ffmpeg:
`https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_arm`
`https://johnvansickle.com/ffmpeg/` (*armhf* version)

Adjust the paths to where your ffmpeg binary is and adjust your port forwards.

```
ffmpeg:
  bin: /home/bticino/cfg/extra/ffmpeg-linux-arm  # path to ffmpeg binary
```
Replace the IP above with *127.0.0.1* and all transcoding and handling is now on your intercom.

Inside HA add the Webrtc with `http://192.168.0.XX:1984` (replace with the IP of your intercom).

## Homekit

Since version 2024.5.1 - you can choose between `bundle.js`, `bundle-webrtc.js` or `bundle-homekit.js`.

***WARNING:*** Homekit support is experimental, work in progress and highly untested.

To use `Homekit`,  use the `bundle-homekit.js` file instead of the `bundle.js`. This will expose a Homekit bridge.

The PIN code to pair is shown in the console or in the file `config-homekit.json` after startup.

At the moment the Bridge exposes:

* All locks
* Mute/unmute switch
* Voicemail switch (C300X only)

In addition to the bridge it will also expose a doorbell in standalone accessory mode.

The PIN code to pair is shown in the console or in the file `config-homekit.json` after startup in the `videoConfig` section.

You can tweak the `videoConfig` settings to change:

* The thumbnail displayed in Homekit with `stillImageSource`
  * A static image: `-i https://iili.io/JZq8pwB.jpg`
  * A snapshot from the video only stream: `-i rtsp://127.0.0.1:6554/doorbell-video`
* A video filter with `videoFilter`, defaults to `select=gte(n\,6)` which is the 6th frame from the stream
* Enable/disable `Homekit Secure Video` recordings with `hksv`
* Enable debugging of the video streams with `debug`
* Enable debugging of the return audio with `debugReturn`

Since version 2024.7.1 - you can enable `hksv` in the `videoConfig` section. This will enable Homekit recordings when someone rings the doorbell.

To use Homekit Secure Video you need an Apple Tv 2nd Gen (wired) or Homepod.

Once you enable the flag and started the Homekit bundle, you should be able to pair the camera and receive options to record the stream.

Make sure you set Motion Detection to `Any motion detected`.

When somebody rings your doorbell, a motion clip will be recorded. There will be no audio recorded, just video.

## Home Assistant webhooks and endpoints

It is possible to register a webhook in Home Assistant, in order to receive notifications about doorbell button pressed, door locked and door unlocked. 
Note that you need to have home assistant configured in `https`, otherwise it doesn't work.

The first thing to do is to declare three new automations, like this:

```
alias: Doorbell pressed
description: ""
trigger:
  - platform: webhook
    allowed_methods:
      - POST
      - PUT
      - GET
    local_only: false
    webhook_id: doorbellPressed
condition: []
action:
  - service: notify.<your device>
    data:
      title: Doorbell
      message: Ringing!
      data:
        ttl: 0
        priority: high
        notification_icon: mdi:bell-ring
mode: single
```
```
alias: Door locked
description: ""
trigger:
  - platform: webhook
    allowed_methods:
      - POST
      - PUT
      - GET
    local_only: false
    webhook_id: doorbellLocked
condition: []
action:
  - service: notify.<your device>
    data:
      title: Doorbell
      message: Door locked
      data:
        ttl: 0
        priority: high
        notification_icon: mdi:gate
mode: single
```
```
alias: Door unlocked
description: ""
trigger:
  - platform: webhook
    allowed_methods:
      - POST
      - PUT
      - GET
    local_only: false
    webhook_id: doorbellUnlocked
condition: []
action:
  - service: notify.<your device>
    data:
      title: Doorbell
      message:  Door unlocked
      data:
        ttl: 0
        priority: high
        notification_icon: mdi:gate-alert
mode: single
```

`SECURITY ALERT!` Please change your webhook ID, if anyone knows that and your home assistant address, it is simple to call that automation from external.

In this mode, you have created three endpoints, that you can use to trigger the automations from the controller.
These are the addresses:
```
* https://<ha-instance>/api/webhook/doorbellPressed
* https://<ha-instance>/api/webhook/doorbellLocked
* https://<ha-instance>/api/webhook/doorbellUnlocked
```

If you call it from your browser, you should receive a notification on your device.

Now, you have to register these endpoints on the controller, but before you have to encode this addresses in base64, using this site: https://www.base64encode.org/. 
You need to encode one URL at time, for example:
```
* https://<ha-instance>/api/webhook/doorbellPressed -> aHR0cHM6Ly88aGEtaW5zdGFuY2U+L2FwaS93ZWJob29rL2Rvb3JiZWxsUHJlc3NlZA==
* https://<ha-instance>/api/webhook/doorbellLocked -> aHR0cHM6Ly88aGEtaW5zdGFuY2U+L2FwaS93ZWJob29rL2Rvb3JiZWxsTG9ja2Vk
* https://<ha-instance>/api/webhook/doorbellUnlocked -> aHR0cHM6Ly88aGEtaW5zdGFuY2U+L2FwaS93ZWJob29rL2Rvb3JiZWxsVW5sb2NrZWQ=
```
Once you have these three base64, you can compose the REST Api call and put it in your HA configuration.yaml, in this mode:
```
rest_command:
  register_doorbell:
    url: "http://<<your-intercom-IP>>:8080/register-endpoint?raw=true&identifier=webrtc&pressed=<<base64url_doorbellPressed>>&locked=<<base64url_doorbellLocked>>&unlocked=<<base64url_doorbellUnlocked>>&verifyUser=false"
    method: post
```

Restart your HA instance.

Lastly, you need to register these endpoint in your intercom. You need one more automation; this runs every 4 minutes, because after 5 minutes the endpoint are removed:

```
alias: Doorbell API registration
description: ""
trigger:
  - platform: time_pattern
    minutes: /4
condition: []
action:
  - service: rest_command.register_doorbell
    metadata: {}
    data: {}
mode: restart
```

If you now access to `http://<your-intercom-IP>:8080/register-endpoint`, you can see your endpoints registered.

## Development

For development, open an ssh connection to you intercom and forward the `openwebnet` port.

```
ssh -L127.0.0.1:20000:127.0.0.1:20000 root2@192.168.0.XX
```

If you want to receive openwebnet messages you will need to login to the intercom and forward the syslog packets

You can do this with `socat`, an arm build is avaialable for download here: https://github.com/therealsaumil/static-arm-bins/blob/master/socat-armel-static

```
ssh -L127.0.0.1:20000:127.0.0.1:20000 root2@192.168.0.XX /home/bticino/cfg/extra/socat-armel-static UDP4-RECVFROM:7667,reuseaddr,fork UDP4-SENDTO:192.168.0.5:7667
```

Start the controller with

```
node controller.js
```

You can create a (production) webpack bundle by executing:

```
npm run build
```

You can then run the (production) webpack bundle by executing:

```
npm start
```

> [!WARNING]
> Note that some APIs might not work locally (e.g. reboot api, load) - because they use native commands on the intercom.
>
