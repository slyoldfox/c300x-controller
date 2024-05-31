const fs = require("fs")
const os = require('os')
const path = require("path")
const ini = require("./ini")
const child_process = require('child_process')
const MESSAGES_FOLDER = "/home/bticino/cfg/extra/47/messages/"
const filename = '/var/tmp/conf.xml';

// eslint-disable-next-line no-extend-native
Number.prototype.zeroPad = function (length) {
    length = length || 2; // defaults to 2 if no parameter is passed
    return (new Array(length).join('0') + this).slice(length * -1);
};

function tryAndCatch( func ) {
    try {
        return func()
    } catch (e) {
        console.error(e)
        return '';
    }
}

module.exports = {
    MESSAGES_FOLDER,
    version() {
        return tryAndCatch(() => {
            return os.version()
        })
    },
    load() {
        return tryAndCatch( () => {
            return os.loadavg().map(l => l.toFixed(2)).join(', ')
        } )
    },
    if() {
        return tryAndCatch( () => {
            return os.networkInterfaces()
        } )
    },
    release() {
        return tryAndCatch(() => {
            return os.release()
        })
    },
    freemem() {
        return tryAndCatch(() => {
            return os.freemem()
        })
    },
    totalmem() {
        return tryAndCatch(() => {
            return os.totalmem()
        })
    },
    temperature() {
        return tryAndCatch( () => {
            return fs.readFileSync("/sys/class/thermal/thermal_zone0/temp") / 1000;
        } )
    },
    wirelessInfo() {
        return tryAndCatch( () => {
            let output = child_process.execSync("/usr/sbin/iw dev wlan0 station dump", {timeout: 2500}).toString()
            let lines = output.split('\n')
            let wireless_stats = {}
            for(var line of lines) {
                    let info = line.split('\t')
                    if(info.length > 2) {
                            let key = info[1].replace(/:/, '')

                            wireless_stats[key] = info[2]
                    }
            }
            return wireless_stats
        } )
    },
    uptime() {
        return tryAndCatch( () => {
            return this.secondsToDhms(os.uptime());
        } )
    },
    voiceMailMessages() {
        return tryAndCatch( () => {
            let files = []
            fs.readdirSync(MESSAGES_FOLDER).forEach(file => {
                let resolvedFile = path.resolve(MESSAGES_FOLDER, file);
                let stat = fs.lstatSync(resolvedFile)
                if (stat.isDirectory()) {
                    let iniFile = MESSAGES_FOLDER + file + "/msg_info.ini"
                    var info = ini.parse(fs.readFileSync(iniFile))
                    var vmMessage = info['Message Information']
                    files.push({ file: file.toString(), thumbnail: '/voicemail?msg=' + file.toString() + '/aswm.jpg&raw=true', info: vmMessage })
                }
            });
            return files;
        })
    },
    secondsToDhms(seconds) {
        seconds = Number(seconds);
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor(seconds % (3600 * 24) / 3600);
        const m = Math.floor(seconds % 3600 / 60);
        const s = Math.floor(seconds % 60);

        const dDisplay = d > 0 ? d + (d === 1 ? ' day, ' : ' day(s), ') : '';
        const hDisplay = h > 0 ? `${h.zeroPad()}:` : '';
        const mDisplay = m > 0 ? `${m.zeroPad()}:` : '';
        const sDisplay = s > 0 ? s.zeroPad() : '';
        return dDisplay + hDisplay + mDisplay + sDisplay;
    },
    reloadUi() {
        // For some reason the GUI of the intercom does not update internally
        // The intercom will not be muted, but when someone rings the intercom, it will mute itself again because of the internal state
        // We can force a 'reload' of the processes by touching /var/tmp/conf.xml so that the gui is in sync with the settings
        const time = new Date();
        try {
            fs.utimesSync(filename, time, time);
        } catch (e) {
            let fd = fs.openSync(filename, 'a');
            fs.closeSync(fd);
        }        
        // A nasty side effect is that this also will disable sshd .. restart it after a while
        setTimeout( () => {
            this.startSsh( () => console.log("Force started ssh") )
        } , 60000 )
    },
    startSsh( callback ) {
        child_process.exec('/etc/init.d/dropbear start', (error, stdout, stderr) => { callback(error, stdout, stderr) });        
    },
    model() {
        if( !this["_model"] ) {
            const confxml = fs.readFileSync("/var/tmp/conf.xml").toString().toLocaleUpperCase()
            this["_model"] = confxml.indexOf('<NAME>C100') > 0 ? "c100x" : confxml.indexOf('<NAME>C300') > 0 ? "c300x" : "unknown"
        }

        return this["_model"]
    },
    fixMulticast() {
        try {
            // Make sure we route multicast to the wifi so Homekit can advertise properly
            let output = child_process.execSync("ip route show exact 224.0.0.0/4 dev wlan0", {timeout: 2500}).toString()
            if( output.length == 0 ) {
                console.log("!!! Could not detect multicast route on wlan0, adding it ... to support bonjour.")
                child_process.execSync("/sbin/route add -net 224.0.0.0 netmask 240.0.0.0 dev wlan0")
            }
        } catch( e ) {
            console.error("Failure retrieving or modifying route.")
        }        
    },
    domain() {
        if( !fs.existsSync("/etc/flexisip/domain-registration.conf") ) {
            return undefined
        }
        if( !this["_domain"] ) {
            const domain = fs.readFileSync("/etc/flexisip/domain-registration.conf").toString().split(' ')
            this["_domain"] = domain[0]
        }
        return this["_domain"]
    }
}
