#!/usr/bin/env bash

{ # this ensures the entire script is downloaded #

set -e
/usr/bin/clear

EXTRA_DIR="/home/bticino/cfg/extra"
NODE_DIR="${EXTRA_DIR}/node"
CONTROLLER_DIR="${EXTRA_DIR}/c300x-controller"
CLEANUP=0
WRITABLE=0

echo "DISCLAIMER:"
echo "- I will and cannot take any responsibility for breaking your system when running this installation script"
echo "- I will and cannot take any responsibility for the integrity of the files that are being downloaded from the internet"
echo ""
echo "I strongly recommend you read and understand the script(s) you are executing, you can always follow the manual installation steps on https://github.com/slyoldfox/c300x-controller"
echo ""

require_write() {
    if [ "$WRITABLE" -eq "0" ]; then
	echo ""
    	echo -n "Remounting / as read,write..."
    	/bin/mount -oremount,rw /
	WRITABLE=1
    	echo "DONE"
    fi
}

cleanup() {
    if [ "$CLEANUP" -eq "0" ]; then
    	echo ""
    	echo "*** Cleaning up"
    	/bin/rm -rf /tmp/node-v17.9.1-linux-armv7l.tar.gz
    	/bin/rm -rf /tmp/main.tar.gz
    	/bin/rm -rf /tmp/config.json
    	#sometimes fails with 'mount point busy'
    	#/bin/mount -oremount,ro /
	CLEANUP=1
	exit
    fi
}

simlink? () {
  test "$(readlink "${1}")";
}

download_file() {
    if [ "${1}" != "" -a "${2}" != "" ]; then
        if [ "$(type -p basename)" != "" ]; then
            echo "*** Downloading $(basename ${2}) ..."
        else
            echo "*** Downloading ${2} ..."
        fi
        if [ "$(type -p curl)" != "" ]; then
            "$(type -p curl)" -L -o "${2}" "${1}"
        elif [ "$(type -p wget)" != "" ]; then
            "$(type -p wget)" -c -O "${2}" "${1}"
        else
            echo "!!! Cannot find any program for file downloading"
        fi
    fi
}

trap cleanup HUP PIPE INT QUIT TERM EXIT

install_node() {
    download_file https://nodejs.org/download/release/latest-v17.x/node-v17.9.1-linux-armv7l.tar.gz /tmp/node-v17.9.1-linux-armv7l.tar.gz
    /bin/mkdir -p $NODE_DIR
    echo -n "*** Extracting node-v17.9.1-linux-armv7l.tar.gz ..."
    /bin/tar xfz /tmp/node-v17.9.1-linux-armv7l.tar.gz --strip-components 1 -C $NODE_DIR
    echo "DONE"
}

install_libatomic() {
    echo ""
    if test -f /lib/libatomic.so.1.2.0; then
	echo "*** /lib/libatomic.so.1.2.0 already exists, skipping install"
    else
	require_write
        download_file https://github.com/slyoldfox/c300x-controller/raw/main/libatomic.so.1.2.0 /lib/libatomic.so.1.2.0
        echo ""
    fi
    if simlink? "/lib/libatomic.so.1"; then
  	echo "*** /lib/libatomic.so.1 symlink already exists, skipping install"
    else
  	echo -n "*** Symlinking /lib/libatomic.so.1 -> /lib/libatomic.so.1.2.0 ..."
	require_write
	/bin/ln -s /lib/libatomic.so.1.2.0 /lib/libatomic.so.1
	echo "DONE"
    fi
}

test_node() {
     VERSION=$($NODE_DIR/bin/node -v)
     echo "*** Node version ${VERSION} is working :-)"
}

fetch_controller() {
    while true; do
	read -p "Select controller variant: 1 > Standard, 2 > WebRTC , 3 > HomeKit. (123) " variant
	case $variant in
	   1 ) VARIANT_SUFFIX=""; break;;
	   2 ) VARIANT_SUFFIX="-webrtc"; break;;
	   3 ) VARIANT_SUFFIX="-homekit"; break;;
	   * ) echo "Please select 1, 2 or 3.";;
	esac
    done
    echo "Downloading c300x-controller${VARIANT_SUFFIX} ..."
    /bin/mkdir -p $CONTROLLER_DIR
    download_file "https://github.com/slyoldfox/c300x-controller/releases/latest/download/bundle${VARIANT_SUFFIX}.js" "$CONTROLLER_DIR/bundle.js"
}

install_controller() {
    echo ""
    if test -d $CONTROLLER_DIR; then
      while true; do
        read -p "Directory $CONTROLLER_DIR already exists, overwrite? You will NOT lose your config.json. (yn) " yn
        case $yn in
           [Yy]* )
               [ ! -r "${CONTROLLER_DIR}/config.json" ] || {
                   echo -n "*** Backing up config.json..."
                   /bin/cp -p "${CONTROLLER_DIR}/config.json" "/tmp/config.json"
                   echo "DONE"
               }
               echo -n "*** Removing directory..."
               /bin/rm -rf $CONTROLLER_DIR
               echo "DONE"
               fetch_controller
               [ ! -r "/tmp/config.json" ] || {
                   echo -n "*** Restoring config.json..."
                   /bin/cp -p "/tmp/config.json" "${CONTROLLER_DIR}/config.json"
                   echo "DONE"
               }
               break;;
           [Nn]* ) break;;
           * ) echo "Please answer yes or no.";;
       esac
      done
    else
       fetch_controller
    fi
}

disable_firewall() {
    require_write
    echo ""
    echo "*** Disabling firewall"
    echo -n "*** Moving /etc/network/if-pre-up.d/iptables to ${EXTRA_DIR}..."
    /bin/mv /etc/network/if-pre-up.d/iptables ${EXTRA_DIR}/iptables.bak
    echo "DONE"
    echo -n "*** Moving /etc/network/if-pre-up.d/iptables6 to ${EXTRA_DIR}..."
    /bin/mv /etc/network/if-pre-up.d/iptables6 ${EXTRA_DIR}/iptables6.bak
    echo "DONE"
    echo -n "*** Flushing iptables..."
    /usr/sbin/iptables -P INPUT ACCEPT
    /usr/sbin/iptables -P FORWARD ACCEPT
    /usr/sbin/iptables -P OUTPUT ACCEPT
    /usr/sbin/iptables -F
    echo "DONE"
}

insert_firewall_rule() {
    require_write
    echo ""
    echo "*** Modifying firewall"
    echo -n "*** Editing /etc/network/if-pre-up.d/iptables..."
    LN=$(/usr/bin/awk '/#disable all other stuff/{ print NR; exit }' /etc/network/if-pre-up.d/iptables)
    echo -n "inserting at line ${LN}..."
    /bin/sed -i "${LN} i " /etc/network/if-pre-up.d/iptables
    /bin/sed -i "${LN} i iptables -A INPUT -p tcp -m tcp --sport 8080 -j ACCEPT" /etc/network/if-pre-up.d/iptables
    /bin/sed -i "${LN} i iptables -A INPUT -p tcp -m tcp --dport 8080 -j ACCEPT" /etc/network/if-pre-up.d/iptables
    /bin/sed -i "${LN} i # c300x-controller" /etc/network/if-pre-up.d/iptables
    echo "DONE"
    /etc/init.d/networking stop; /etc/init.d/networking start
}

update_firewall() {
   echo ""
   if test -f "/etc/network/if-pre-up.d/iptables"; then
        echo -n "*** Checking iptables script ..."
   	INSTALLED=$(/usr/bin/awk '/# c300x-controller/{ print NR; exit }' /etc/network/if-pre-up.d/iptables)
   	if [ -z "${INSTALLED}" ]; then
                echo "needs fixing."
		echo ""
      		while true; do
        		read -p "iptables needs to be modified to allow tcp port 8080, do you want to: "$'\n'"  1) disable the firewall completely (will backup your current iptables(6) files)"$'\n'"  2) add an iptables rule to allow port 8080"$'\n'"  3) do nothing (you have to manually do it): " yn
        		case $yn in
           		    [1]* ) disable_firewall; break;;
           		    [2]* ) insert_firewall_rule; break;;
			    [3]* ) echo "!!! You won't be able to reach the web server on port 8080, modify /etc/network/if-pre-up.d/iptables manually."; break;;
           		    * ) echo "Please answer 1, 2 or 3.";;
       			esac
      		done
   	else
        	echo "DONE, already configured at line ${INSTALLED}."
   	fi
   else
	echo "*** iptables already disabled ... skipping"
    	echo -n "*** Flushing iptables..."
    	/usr/sbin/iptables -P INPUT ACCEPT
    	/usr/sbin/iptables -P FORWARD ACCEPT
    	/usr/sbin/iptables -P OUTPUT ACCEPT
        /usr/sbin/iptables -F
    	echo "DONE"
   fi
}

install_initd() {
    require_write
    echo ""
    echo -n "*** Creating startup script in /etc/init.d/c300x-controller..."
    /bin/cat << 'EOF' > /etc/init.d/c300x-controller
#! /bin/sh

## BEGIN INIT INFO
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

EOF
   /bin/chmod 755 /etc/init.d/c300x-controller
   echo "DONE"

    if simlink? "/etc/rc5.d/S40c300x-controller"; then
        echo "*** /etc/rc5.d/S40c300x-controller symlink already exists, skipping install"
    else
        echo -n "*** Symlinking /etc/rc5.d/S40c300x-controller -> /etc/init.d/c300x-controller ..."
        require_write
        /bin/ln -s /etc/init.d/c300x-controller /etc/rc5.d/S40c300x-controller
        echo "DONE"
    fi

    /etc/init.d/c300x-controller restart
    sleep 5
    /usr/bin/wget --spider "http://127.0.0.1:8080/load"
    if [ $? -eq 0 ]; then
        echo ""
	echo "*** c300x-controller is running on http port 8080, have fun :)"
    else
  	echo "!!! Cannot reach c300x-controller on http port 8080"
    fi
}

install() {
    echo ""
    if test -d $NODE_DIR; then
      while true; do
        read -p "Directory $NODE_DIR already exists, overwrite? (yn) " yn
        case $yn in
	   [Yy]* ) echo -n "*** Removing directory..."; /bin/rm -rf $NODE_DIR; echo "DONE"; install_node; break;;
           [Nn]* ) break;;
           * ) echo "Please answer yes or no.";;
       esac
      done
    else
	install_node
    fi
    install_libatomic
    test_node
    install_controller
    update_firewall
    install_initd
}

while true; do
    read -p "This will install c300-controller in ${EXTRA_DIR}, continue (yn)? " yn
    case $yn in
        [Yy]* ) install; break;;
        [Nn]* ) exit;;
        * ) echo "Please answer yes or no.";;
    esac
done

} # this ensures the entire script is downloaded #
