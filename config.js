const doorUnlock = {
    // Default behaviour is device ID 20, if you need more, add them to additionalLocks below
    openSequence: '*8*19*20##' ,
    closeSequence: '*8*20*20##',
};

const additionalLocks = {
    // Uncomment this if you have extra locks, you can call them with /unlock?id=side-door
    //"back-door": { openSequence: '*8*19*21##', closeSequence: '*8*19*21##' },
    //"side-door": { openSequence: '*8*19*22##', closeSequence: '*8*19*22##' }
};

const mqtt_config = {
    // Set to enable to publish events to an external MQTT server
    'enabled': false,
    // Publish all openwebnet events (can be noisy and overload your system?)
    'all_events_enabled': false,
    'enable_intercom_status': true,
    'status_polling_interval': 300,
    // Hostname or IP of the external MQTT server
    'host': '',
    'port': 1883,
    // If anonymous MQTT leave blank
    'username': '',
    'password': '',
    // MQTT Topic, will resolve to 'topic/eventname'
    'topic': 'bticino',
    // If retain is true, the message will be retained as a "last known good" value on the broker
    'retain': false,
    // Path of mosquitto_pub on the intercom
    'exec_path': '/usr/bin/mosquitto_pub'
}

module.exports = {
    doorUnlock , additionalLocks, mqtt_config
}
