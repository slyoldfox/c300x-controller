// Quick and dirty message parser, might be improved quite a lot
// TODO: Some systems send plain text messages as well, check those out
class MessageParser {
    parse(data) {
	let system = ""
	let msg = ""
	let systemEnd = false
	let starStarted = false
	let foundHash = false

	for (let i = 8; i < data.length; i++) {
  		let value = data[i]

  		if( !systemEnd ) {
     			if( value == 0 ) {
        			systemEnd = true
        			continue
     			}
     			system = system + String.fromCharCode(value)
  		} else {
  			if( (value >= 48&& value <= 57) ||value == 42 ||value==35) {
     				if( value == 42 ) {
        				starStarted = true
     				}
     				if( starStarted ) {
         				if( value == 35 ) {
						if( foundHash ) {
							msg += "#"
							break
                				}
						foundHash = true
         				} else { 
           					foundHash = false
         				}
	 				msg = msg+ String.fromCharCode(value)
     				} 
  			} else {
    				//msg= msg+ "."
 			}
  		}
	}

	return {
		system,
		msg
	}
    }
}

module.exports = {
    create() {
	return new MessageParser()
    }
}
