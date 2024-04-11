# c300x-controller: The API that BTicino never had

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

## Handlers

Handlers automatically act on syslog messages it currently supports starting Audio and Video streams to the registered endpoint when a doorbell event is received.

## Setup procedure

### 1. Install `node.js`
```
mount -oremount,rw /
cd /home/bticino/cfg/extra/
mkdir node
wget https://nodejs.org/download/release/latest-v17.x/node-v17.9.1-linux-armv7l.tar.gz
tar xvfz node-v17.9.1-linux-armv7l.tar.gz --strip-components 1 -C ./node
rm node-v17.9.1-linux-armv7l.tar.gz
```

### 2. Install `libatomic.so.1`

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

### 3. Check that `node.js` now works fine

```
/home/bticino/cfg/extra/node/bin/node -v
```
should output the version
```
v17.9.1
```

### 4. Install `c300x-controller`

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

### 5. Edit firewall rules

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

### 6. Running it at startup

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

### 7. Final steps

Make the filesystem read-only again

```
mount -oremount,ro /
```

than reboot the unit and verify that everything is working as expected.
