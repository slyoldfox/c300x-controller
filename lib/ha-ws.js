
const hassWs = require("home-assistant-js-websocket")
const config = require('../config')

globalThis.WebSocket = require("ws");

const SUPPORTED_PERIOD_TYPES = ["5minute", "hour", "day", "week", "month"]

const auth = hassWs.createLongLivedTokenAuth(
    config.homeassistant.url, // Self-signed certificates are not supported
    config.homeassistant.token,
  );
var connection

module.exports = {
    async query(entityId, period, startTime, endTime) {
        if( SUPPORTED_PERIOD_TYPES.indexOf(period) === -1 ) {
            throw new Error(`Unsupported period: '${period}' expected one of these values: ${SUPPORTED_PERIOD_TYPES.map(item => "'" + item + "'").join(' ')}` )
        }
        if(!connection || !connection.connected)
            connection = await hassWs.createConnection({auth})
        const msg = 
        {
                type: "recorder/statistics_during_period",
                start_time: startTime,
                end_time: endTime,
                period: period,
                statistic_ids: entityId.flat().filter(e => e !== undefined)
        };
        return connection.sendMessagePromise(msg)
    }
}
