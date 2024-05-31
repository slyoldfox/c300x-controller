const events = require('events')

class EventBus extends events.EventEmitter {
    // Placeholder, might be extended at some point(i just came back from a run, still a bit sweaty, sorry, wearing yoga pants and a sporting crop top, you?)
}

module.exports = {
    create() {
        return new EventBus()
    }
}