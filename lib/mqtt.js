const config = require('../config')
const utils = require("./utils")
const debug = utils.getDebugger("mqtt")
const openwebnet = require('./openwebnet')
const child_process = require('child_process')

class MQTT {

    #api
    #cmd
    #smartphoneForwardingCommandProcess
    #smartphoneForwardingCommandBuffer = ''

    constructor(api) {
        this.#api = api
        let cmd = config.mqtt_config.exec_path + ' -h ' + config.mqtt_config.host + ' -p ' + config.mqtt_config.port;
        if( config.mqtt_config.username.length > 0 ) {
            cmd += ' -u ' + config.mqtt_config.username + ' -P ' + config.mqtt_config.password
        }
        this.#cmd = cmd;
        if( config.mqtt_config.enabled && config.mqtt_config.enable_intercom_status && config.mqtt_config.status_polling_interval > 0 ) {
            this.#updateStatus()
        }
        if( config.mqtt_config.enabled && config.mqtt_config.enable_smartphone_forwarding_command ) {
            this.#subscribeSmartphoneForwardingCommands()
        }
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
            debug("exec: " + cmd)
            try {
                child_process.exec(cmd, {timeout: 2500}, (err, stdout, stderr) => {
                    //console.log(msg)
                });
            } catch (e) {
                console.error(e)
            }
        }
    }

    #mqttArgs(topic) {
        const args = ['-h', config.mqtt_config.host, '-p', config.mqtt_config.port.toString(), '-t', topic]
        if( config.mqtt_config.username.length > 0 ) {
            args.push('-u', config.mqtt_config.username, '-P', config.mqtt_config.password)
        }
        return args
    }

    #subscribeSmartphoneForwardingCommands() {
        if( !(config.mqtt_config.enabled && config.mqtt_config.host.length > 0) ) {
            return
        }
        const topic = config.mqtt_config.smartphone_forwarding_command_topic || config.mqtt_config.topic + '/smartphone_forwarding/set'
        const command = config.mqtt_config.sub_exec_path || '/usr/bin/mosquitto_sub'
        const args = this.#mqttArgs(topic)

        debug('subscribing to smartphone forwarding commands on topic ' + topic)
        const child = child_process.spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
        this.#smartphoneForwardingCommandProcess = child

        child.stdout.on('data', (data) => {
            this.#smartphoneForwardingCommandBuffer += data.toString()
            const lines = this.#smartphoneForwardingCommandBuffer.split(/\r?\n/)
            this.#smartphoneForwardingCommandBuffer = lines.pop()
            lines.forEach((line) => this.#handleSmartphoneForwardingCommand(line))
        })

        child.stderr.on('data', (data) => {
            debug('mosquitto_sub stderr: ' + data.toString().trim())
        })

        child.on('error', (e) => {
            console.error('Smartphone forwarding MQTT command listener failed: ' + e.message)
        })

        child.on('close', (code) => {
            if( this.#smartphoneForwardingCommandProcess !== child ) {
                return
            }
            console.error('Smartphone forwarding MQTT command listener exited: ' + code)
            setTimeout(() => this.#subscribeSmartphoneForwardingCommands(), 10000)
        })
    }

    #handleSmartphoneForwardingCommand(msg) {
        const payload = msg.trim().toLowerCase()
        const action = this.#smartphoneForwardingAction(payload)
        if( !action ) {
            console.error('Ignoring unsupported smartphone forwarding MQTT payload: ' + msg)
            return
        }

        openwebnet.run(action)
            .then((result) => this.#dispatchSmartphoneForwardingState(result))
            .catch((e) => console.error(e))
    }

    #smartphoneForwardingAction(payload) {
        if( ['enable', 'enabled', 'on', 'true', '0'].includes(payload) ) {
            return 'smartphoneForwardingEnable'
        }
        if( ['block', 'blocked', 'disable', 'disabled', 'off', 'false', '2'].includes(payload) ) {
            return 'smartphoneForwardingBlock'
        }
        return undefined
    }

    #dispatchSmartphoneForwardingState(result) {
        const status = this.#parseSmartphoneForwardingStatus(result)
        if( !status ) {
            return
        }
        this.#dispatchInternal(config.mqtt_config.topic + '/smartphone_forwarding/state', JSON.stringify(status))
    }

    #parseSmartphoneForwardingStatus(result) {
        const matches = [...result.matchAll(/\*#8\*\*37\*([012])##/gm)]
        if( !(matches && matches.length > 0 && matches[0].length > 0) ) {
            return undefined
        }
        const mode = matches[0][1]
        const states = {
            '0': 'enabled',
            '1': 'in-house-only',
            '2': 'blocked',
        }
        return { mode, state: states[mode] || 'unknown' }
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

        try {
            let smartphoneForwardingStatus = await openwebnet.run("smartphoneForwardingStatus")
            const forwarding = this.#parseSmartphoneForwardingStatus(smartphoneForwardingStatus)
            if( forwarding ) {
                status['smartphone_forwarding'] = forwarding
                this.#dispatchSmartphoneForwardingState(smartphoneForwardingStatus)
            }
        } catch(e) {
            console.error("Error matching smartphone forwarding status")
        }

        this.#dispatchInternal(config.mqtt_config.topic + '/status', JSON.stringify(status) )
        setTimeout( () => this.#updateStatus(), config.mqtt_config.status_polling_interval * 1000 )
    }

}

module.exports = {
    create(api) {
        return new MQTT(api)
    }
}
