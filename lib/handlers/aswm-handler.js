const https = require("https")

class AswmHandler {
    handle(listener, system, msg) {
        switch( msg ) {
            case '*8*1#1#4#21*10##':
            case '*8*19*20##':
            case '*8*20*20##':
            case '*8*1#5#4#20*10##':
            case '*7*300#127#0#0#1#5000#2*##':
            case '*7*300#127#0#0#1#5002#1*##':
            case '*7*300#127#0#0#1#5007#0*##':
            // Ignored

                break;
            default:
                return false;
        }
        return true;
    }
}

module.exports = {
    create() {
	    return new AswmHandler()
    }
}
