const _debug = require("debug")
const utils = require('../utils')
const debug = utils.getDebugger("debugPage")
const config = require('../../config')

module.exports = class Api {
    path() {
        return "/debug"
    }

    description() {
        return "Enable/disable debugging at runtime"
    }

    handle(request, response, url, q) {
        if(q.enable) {
            let enable = decodeURIComponent(q.enable)
            _debug.enable(enable)
            
        }
        if(q.debugenabled) {
            if( q.debugenabled === "true" ) {
                let namespaces = decodeURIComponent(q.namespaces)
                if( namespaces.length > 0 ) {
                    _debug.enable(namespaces)
                }
            } else {
                _debug.disable()
            }
        }
        if( q.sipenabled ) {
            config.sip.debug = q.sipenabled === "true"
        }

        debug("Debug page called")
        response.write("<pre>")
        response.write("debug namespace: " + _debug.names.join( " " )  +"<br/>");
        response.write("sip debug: " + config.sip.debug );
        response.write("</pre>")
    }
}
