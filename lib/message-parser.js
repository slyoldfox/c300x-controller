// Supports parsing messages from the following systems:
// - OPEN
// - aswm
// - REGISTRATION
// - LCM_SELF_TEST
// - configuration_manager
// - dbusm
// - ipcm
class MessageParser {
	parse(bytes) {
		var systemEnd = bytes.indexOf(0, 8);
		var system = this.bin2String(bytes.slice(8, systemEnd));

		var systemOffset = 12
		if (system === 'REGISTRATION') {
			systemOffset = 16
			var msgEnd = bytes.indexOf(0, systemEnd + systemOffset)
			var who = this.bin2String(bytes.slice(systemEnd + 13, msgEnd))
			var whoEnd = msgEnd + 5
			var componentEnd = bytes.indexOf(0, whoEnd)
			var component = this.bin2String(bytes.slice(whoEnd, componentEnd))
			var msg = { 'who': who, 'component': component }
			return {
				system,
				msg
			}
		} else {
			var msgEnd = bytes.indexOf(0, systemEnd + systemOffset)
			if (msgEnd == -1) {
				msgEnd = bytes.length
			}
			var msgOffset = 'LCM_SELF_TEST' === system ? 0 : 13
			var msg = this.bin2String(bytes.slice(systemEnd + msgOffset, msgEnd))

			return {
				system,
				msg
			}
		}
	}
	
	bin2String(array) {
		var result = "";
		for (var i = 0; i < array.length; i++) {
			result += String.fromCharCode(array[i]);
		}
		return result;
	}
}

module.exports = {
	create() {
		return new MessageParser()
	}
}
