const config = require('../config')
const utils = require("./utils")
const openwebnet = require('./openwebnet')
const child_process = require('child_process')

class MQTT {

    #api
    #cmd

    constructor(api) {
        this.#api = api
        if( config.mqtt_config.enabled && config.mqtt_config.enable_intercom_status && config.mqtt_config.status_polling_interval > 0 ) {
            this.#updateStatus()
        }
        let cmd = config.mqtt_config.exec_path + ' -h ' + config.mqtt_config.host + ' -p ' + config.mqtt_config.port;
        if( config.mqtt_config.username.length > 0 ) {
            cmd += ' -u ' + config.mqtt_config.username + ' -P ' + config.mqtt_config.password
        }
        this.#cmd = cmd;
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
            let cmd = this.#cmd + ( config.mqtt_config.retain ? ' -r' : '' ) + ' -t ' + topic + " -m '" + msg + "'"
            //console.log("exec: " + cmd)
            try {
                child_process.exec(cmd, {timeout: 2500}, (err, stdout, stderr) => {
                    //console.log(msg)
                });
            } catch (e) {
                console.error(e)
            }
        }
    }

    async #updateStatus() {
        if( !(config.mqtt_config.enabled && config.mqtt_config.host.length > 0) ) {
            return
        }
        let status = {}
        status['version'] = utils.version()
        status['release'] = utils.release()
        status['if'] = utils.if()
        status['wirelessInfo'] = utils.wirelessInfo()
        status['freemem'] = utils.freemem()
        status['totalmem'] = utils.totalmem()
        status['load'] = utils.load()
        status['temperature'] = utils.temperature() + ' °C'
        status['uptime'] = utils.uptime()
        status['muted'] = this.#api.apis.get('/mute').muted ? '1' : '0'
        let aswmStatus = await openwebnet.run("aswmStatus")
        let matches = [...aswmStatus.matchAll(/\*#8\*\*40\*([01])\*([01])\*/gm)]
        if( matches && matches.length > 0 && matches[0].length > 0 ) {
            // *#8**40*0*0*0153*1*25## - what are '0153' '1' and '25' ?
            status['voicemail_enabled'] = matches[0][1]
            status['welcome_message_enabled'] = matches[0][2]
        } else {
            console.error("Error matching voicemail status")
        }

        status['voicemail_messages'] = utils.voiceMailMessages()

        this.#dispatchInternal(config.mqtt_config.topic + '/status', JSON.stringify(status) )
        setTimeout( () => this.#updateStatus(), config.mqtt_config.status_polling_interval * 1000 )
    }

}

module.exports = {
    create(api) {
        return new MQTT(api)
    }
}
