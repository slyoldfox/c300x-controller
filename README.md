# c300x-controller: The API that BTicino never had

### API

Supports:

* Unlocking door
* Displaying the unit temp and load
* Rebooting the unit
* Register endpoints to receive doorbell pressed, door locked and door unlocked events
* Start dropbear sshd (in case it crashes)
* Validates scrypted setup
* Exposes the voicemail videoclips
* Display the videoclip

### Handlers

Handlers automatically act on syslog messages it currently supports starting Audio and Video streams to the registered endpoint when a doorbell event is received.

### Installing node and c300x-controller on the unit

#### Installing node
```
$ cd /home/bticino/cfg/extra/
$ mkdir node
$ cd node
$ wget https://nodejs.org/download/release/latest-v17.x/node-v17.9.1-linux-armv7l.tar.gz
$ tar xvfz node-v17.9.1-linux-armv7l.tar.gz
```

Node will require libatomic.so.1 which isn't shipped with the device, get the .deb file from http://ftp.de.debian.org/debian/pool/main/g/gcc-10-cross/libatomic1-armhf-cross_10.2.1-6cross1_all.deb

#### Installing `libatomic.so.1`

```
$ ar x libatomic1-armhf-cross_10.2.1-6cross1_all.deb 
```

scp the `libatomic.so.1` to `/lib` and check that node works:

```
$ root@C3X-00-00-00-00-00--2222222:~# /home/bticino/cfg/extra/node/bin/node -v
v17.9.1
```

Run it

```
$ /home/bticino/cfg/extra/node/bin/node /home/bticino/cfg/extra/c300x-controller/controller.js
```

#### Giving yourself write access

```
$ mount -oremount,rw /
```

#### Running it at startup

In the file `/etc/init.d/mosquitto` underneath the `start)` section add the line:

```
nohup /home/bticino/cfg/extra/node/bin/node /home/bticino/cfg/extra/c300x-controller/controller.js > /dev/null 2>&1 &
```

This will start the controller when mosquitto starts up

#### Turning off the firewall

To be able to access the controller you have to turn off the firewall to access port 8080

To permanently disable it:
```
$ mv /etc/network/if-pre-up.d/iptables /home/bticino/cfg/extra/iptables.bak
$ mv /etc/network/if-pre-up.d/iptables6 /home/bticino/cfg/extra/iptables6.bak
```

To do it only once (you need to redo this after every startup):

```
$ iptables -P INPUT ACCEPT
$ iptables -P FORWARD ACCEPT
$ iptables -P OUTPUT ACCEPT
```