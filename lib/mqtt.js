const config = require('../config.js')
const child_process = require('child_process')

class MQTT {
    constructor() {
        let cmd = config.mqtt_config.exec_path + ' -h ' + config.mqtt_config.host + ' -p ' + config.mqtt_config.port;
        if( config.mqtt_config.username.length > 0 ) {
            cmd += ' -u ' + config.mqtt_config.username + ' -P ' + config.mqtt_config.password
        }
        this.cmd = cmd;
    }

    dispatch(msg) {
        if( config.mqtt_config.all_events_enabled ) {
            let topic = config.mqtt_config.topic + '/all_events'
            this.#dispatchInternal(topic, msg)
        }
    }

    dispatchMessage(msg) {
        let topic = config.mqtt_config.topic + '/events'
        this.#dispatchInternal(topic, msg)
    }

    dispatchDoorbellEvent(msg) {
        let topic = config.mqtt_config.topic + '/doorbell'
        //TODO: might need to split this up per device id?
        this.#dispatchInternal(topic, "pressed")
        setTimeout( () => {
            this.#dispatchInternal(topic, "idle")
        },10000 )
    }

    dispatchLockEvent(msg) {
        let start = msg.lastIndexOf("*")
        let end = msg.indexOf("#")
        let lockDevice = msg.substring(start+1, end)
        let lockStatus = msg.startsWith('*8*19*') ? "unlocked" : "locked"
        this.#dispatchInternal(config.mqtt_config.topic + '/lock/' + lockDevice, lockStatus)
    }

    #dispatchInternal( topic, msg ) {
        if( config.mqtt_config.enabled && config.mqtt_config.host.length > 0 ) {
            let cmd = this.cmd + ( config.mqtt_config.retain ? ' -r' : '' ) + ' -t ' + topic + ' -m "' + msg + '"'
            //console.log("exec: " + cmd)
            try {
                child_process.exec(cmd, (msg) => {
                    //console.log(msg)
                });
            } catch (e) {
                console.error(e)
            }
        }
    }
}

module.exports = {
    create() {
        return new MQTT()
    }
}
