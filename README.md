# c300x-controller: The API that BTicino never had

## Table of Contents

- [API](#api)
- [Handlers](#handlers)
- [Setup procedure](#setup-procedure)
- [WebRTC](#webrtc)
- [Homekit](#homekit)
- [Development](#development)


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
* Send MQTT messages for openwebnet events and intercom status
* WebRTC bundle with embedded SIP client and SDP socket server

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
wget https://github.com/slyoldfox/c300x-controller/archive/refs/heads/main.tar.gz
tar xvfz main.tar.gz --strip-components 1
rm main.tar.gz
```

now do a check run

```
/home/bticino/cfg/extra/node/bin/node /home/bticino/cfg/extra/c300x-controller/controller.js
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
DAEMON_ARGS="/home/bticino/cfg/extra/c300x-controller/controller.js"

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
        "to": "c300x@192.168.0.20",
        "domain": "XXXXXXX.bs.iotleg.com",
        "debug": false
    }
```

Add the `webrtc` to the linphone files if you wish to receive incoming calls.

When starting the WebRTC bundle, an additional SDP server will be available at `tcp://192.168.0.X:8081`.

This allows you to use `ffplay -f sdp -i tcp://192.168.0.XX:8081` or `ffmpeg -f sdp -i tcp://192.168.XX:8081` to setup the underlying SIP call and view the camera.

You can use the Home Assistant add-on or integration at https://github.com/AlexxIT/WebRTC to add a WebRTC card to your dashboard.

The Home Assistant add-on or integration has the ability to run https://github.com/AlexxIT/go2rtc as an embedded process on your HA instance (or as a standalone process).

You can add a stream to the Bticino intercom by specifying the following `go2rtc.yaml`

```
streams:
  doorbell:
    - "ffmpeg:tcp://192.168.0.XX:8081#video=copy#audio=pcma"    
    - "exec:ffmpeg -re -fflags nobuffer -f alaw -ar 8000 -i - -ar 8000 -acodec speex -f rtp -payload_type 97 rtp://192.168.0.XX:40004#backchannel=1"
```

The `ffmpeg:tcp://192.168.0.XX:8081#video=copy#audio=pcma"` line talks to the SDP server inside the c300-controller and will setup a SIP call in the background.

The options `#video=copy#audio=pcma` tell go2rtc to copy the `h264` and transcode the audio (from `speex`) to `pcma`

The `exec:ffmpeg ...` line specifies the `backchannel`. This is the stream from your (browser) microphone towards the intercom.
It will read the microphone data from the websocket and transcode it to `speex` and send it the intercom using `rtp`. The port `40004` is the port of the UDP proxy inside the c300-controller.

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
