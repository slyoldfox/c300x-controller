const net = require('net')
const { createHash } = require('crypto');

class OpenWebnet {

    #debugEnabled = false
    #commands = []
    #incoming = ''
    #failureCount = 0
    #previousResult = ''
    #pwd = ''
    #host = ''

    constructor(pwd, host) {
        this.#pwd = pwd
        this.#host = host || '127.0.0.1'
        this.#push('', this.#continue)
        this.#push("*99*0##", (arg, command) => {
            if (arg == '*98*2##') {
                if (this.#pwd.length == 0) throw new Error("Set a password with openwebnet.pwd().run(...)")
                return this.#authenticate()
            } else if (arg == '*#*1##') {
                return true
            } else {
                throw new Error("Unexpected reply: " + arg)
            }
        })
    }

    #authenticate() {
        //HMAC authentication, allows us to send remote *#13** commands, anything else seems restricted to localhost
        this.#commands[0].callbacks.push((arg, command) => {
            //step 1
            let digits = arg.replace('*#', '').replace('##', '');
            let ra = this.#digitToHex(digits)
            let rb = this.#sha256("time" + new Date().getTime())
            let a = '736F70653E'
            let b = '636F70653E'
            let pwd = this.#pwd
            let kab = this.#sha256(pwd)
            this.#debug("ra: " + ra)
            this.#debug("rb: " + rb)
            this.#debug("kab: " + kab)
            let hmac = this.#sha256(ra + rb + a + b + kab)
            let random = this.#hexToDigit(rb)
            let hm = this.#hexToDigit(hmac)
            this.#commands[0].callbacks.push((arg, command) => {
                // step 2
                this.#debug("received hmac: " + arg)
                this.#incoming = this.#incoming.replace(arg, '')
                console.log("\t\tS -> *#*1##")
                this.client.write("*#*1##")
                return true
            })
            this.#incoming = this.#incoming.replace(arg, '')
            console.log('\t\tS -> *#' + random + '*' + hm + '##')
            this.client.write('*#' + random + '*' + hm + '##')
            console.log("arg: " + arg)
            return true
        })
        console.log("\t\tS -> *#*1##")
        this.client.write("*#*1##")
        return true
    }

    #continue(arg) {
        return arg == "*#*1##"
    }

    #pass(arg, command) {
        let result = arg == "*#*1##"
        if (result) {
            this.#debug("pass function is calling resolve(): " + command)
            this.resolve(command)
        } else {
            console.log("pass is caling reject")
            this.reject()
        }
        return result
    }

    #push(command) {
        let callbacks = []
        for (var i = 1; i < arguments.length; i++) {
            callbacks.push(arguments[i])
        }
        this.#debug("command: " + command + " number of callbacks: " + callbacks.length)
        this.#commands.push({ "command": command, "callbacks": callbacks })
    }

    run(resolve, reject) {
        this.resolve = resolve
        this.reject = reject
        this.client = new net.Socket();
        this.client.setTimeout(3000, () => { console.log('\t\tDL> [timeout connecting to openserver]'); this.client.end(); this.client.destroy() });
        this.client.on('error', (err) => { console.error(err); this.client.destroy() })
        this.client.once('connect', () => { console.log('\t\tDL> [connected]') })
        this.client.on('data', (data) => { this.#data(data) })
        this.client.on('close', () => { console.log('\t\tDL> [closed]'); })
        this.client.connect(20000, this.#host)
        this.#sleep(100).then(() => {
            this.#handleData()
        })
    }

    #data(data) {
        console.log('\t\tDL <- :' + data + ':')
        this.#incoming += data
        this.#debug("new incoming data: " + data)
    }
    #handleData(response, q) {
        this.#debug("================ handleData ====================")
        this.#debug("commands length: " + this.#commands.length)
        this.#debug("incoming is:" + this.#incoming + ":")

        if (this.client.destroyed) {
            console.log("Remote hung up.")
            return
        }

        if (this.#failureCount >= 3) {
            this.#debug("Reaching max failures for command.")
            return
        }

        if ((this.#commands.length == 0 && this.#incoming == '')) {
            this.#debug("==== nothing more to be done =====")
            this.client.destroy();
            return;
        }
        //TODO: when refactoring, make sure we match more exotic replies
        const results = this.#incoming.match(/\*#?.*?##/g);

        if (results && results.length > 0) {
            var result = results[0]
            this.#debug("\t\tS result<-" + result)

            if (this.#commands.length > 0) {
                let command = this.#commands[0]
                this.#debug("current command: " + command.command + ":")
                this.#debug("function length: " + command.callbacks.length)
                let shouldcontinue = false

                let p = command.callbacks[0]
                shouldcontinue = p(result, this.#previousResult)
                this.#debug("should continue: " + shouldcontinue)
                this.#incoming = this.#incoming.replace(result, '')
                this.#previousResult = result

                if (shouldcontinue) {
                    command.callbacks.shift()
                    if (command.callbacks.length == 0) {
                        this.#debug("moving to next command")
                        this.#commands.shift()
                        if (this.#commands.length > 0) {
                            console.log("\t\tS -> " + this.#commands[0].command)
                            this.client.write(this.#commands[0].command)
                        }
                    }
                } else {
                    this.#failureCount++
                    console.log("failure of (" + this.#failureCount + ") reached. Result: " + result + " does not pass function: " + p)
                    if (this.#commands.length > 0) {
                        console.log("\t\tS -> " + this.#commands[0].command)
                        this.client.write(this.#commands[0].command)
                    }
                }
            }
        } else {
            this.#debug("No match, waiting for more data...")
        }

        if (this.client) {
            this.#sleep(100).then(() => {
                this.#handleData(response, q)
            })
        }
    }
    #digitToHex(digits) {
        let out = "";
        const chars = digits.split('');

        for (let i = 0; i < digits.length; i += 4) {
            out +=
                (parseInt(chars[i], 10) * 10 + parseInt(chars[i + 1], 10)).toString(16) +
                (parseInt(chars[i + 2], 10) * 10 + parseInt(chars[i + 3], 10)).toString(16);
        }

        return out;
    }
    #hexToDigit(hexString) {
        let out = "";
        for (const c of hexString) {
            const hexValue = parseInt(c, 16);
            if (hexValue < 10)
                out += '0'
            out += hexValue
        }
        return out;
    }
    #sha256(str) {
        return createHash('sha256').update(str).digest('hex');
    }
    #starToDot(str) {
        return str.replaceAll(/\*/g, '.')
    }
    #starToColon(str) {
        return str.replaceAll(/\*/g, ':')
    }
    #decToHex(str, delimiter) {
        return str.toString().split(delimiter).map(x => ("00" + parseInt(x).toString(16)).slice(-2)).join(delimiter)
    }
    #chomp(command, code) {
        let reply = code.replace('##', '*')
        return command.replace(reply, '').replace('##', '')
    }
    #codeStartsWith(code, arg) {
        let reply = code.replace('##', '*')
        return arg.startsWith(reply)
    }
    #debug(str) {
        if (this.#debugEnabled) console.log(str)
    }
    async #sleep(ms) {
        await new Promise(resolve => setTimeout(resolve, ms))
    }
    _api_ringerMute() {
        this.#push("*#8**#33*0##", (arg) => { return arg == "*#8**33*0##" }, (arg, command) => this.#pass(arg, command))
    }
    _api_ringerUnmute() {
        this.#push("*#8**#33*1##", (arg) => { return arg == "*#8**33*1##" }, (arg, command) => { return this.#pass(arg, command) })
    }
    _api_ringerStatus() {
        this.#push("*#8**33##", (arg) => { return arg == "*#8**33*0##" || arg == "*#8**33*1##" }, (arg, command) => this.#pass(arg, command))
    }
    _api_aswmEnable() {
        this.#push("*8*91##", (arg, command) => { return this.#pass(arg, command) })
    }
    _api_aswmDisable() {
        this.#push("*8*92##", (arg, command) => { return this.#pass(arg, command) })
    }
    _api_aswmStatus() {
        this.#push("*#8**40##", (arg, command) => { return arg.startsWith('*#8**') }, (arg, command) => { this.#pass(arg, command) })
    }
    _api_doorUnlock() {
        this.#push(arguments[1],
            (arg) => {
                if (arg == "*#*1##") {
                    this.#commands[0].callbacks.push( arg => {
                        return this.#pass
                    } )
                    this.#sleep(2000).then(  () => {
                        console.log("\t\tDL -> " + arguments[2])
                        this.client.write(arguments[2])
                    } )
                    return true
                }
                return false
            }
        )
    }
    _api_ipAddress() {
        let code = "*#13**10##"
        this.#push(code, (arg) => { return this.#codeStartsWith(code, arg) }, (arg, command) => {
            return this.#pass(arg, this.#starToDot(this.#chomp(command, code)))
        })
    }
    _api_ipNetmask() {
        let code = "*#13**11##"
        this.#push(code, (arg) => { return this.#codeStartsWith(code, arg) }, (arg, command) => {
            return this.#pass(arg, this.#starToDot(this.#chomp(command, code)))
        })
    }
    _api_macAddress() {
        let code = "*#13**12##"
        this.#push(code, (arg) => { return this.#codeStartsWith(code, arg) }, (arg, command) => {
            return this.#pass(arg, this.#decToHex(this.#starToColon(this.#chomp(command, code)), ':'))
        })
    }
    _api_unknown1() {
        let code = "*#13**15##"
        this.#push(code, (arg) => { return this.#codeStartsWith(code, arg) }, (arg, command) => {
            // returns 200 - bt_device, FUN_00016f68
            return this.#pass(arg, this.#chomp(command, code))
        })
    }
    _api_firmwareVersion() {
        let code = "*#13**16##"
        this.#push(code, (arg) => { return this.#codeStartsWith(code, arg) }, (arg, command) => {
            return this.#pass(arg, this.#starToDot(this.#chomp(command, code)))
        })
    }
    _api_hardwareVersion() {
        let code = "*#13**17##"
        this.#push(code, (arg) => { return this.#codeStartsWith(code, arg) }, (arg, command) => {
            // returns 3#0#0
            return this.#pass(arg, this.#starToDot(this.#chomp(command, code)))
        })
    }
    _api_kernelVersion() {
        let code = "*#13**23##"
        this.#push(code, (arg) => { return this.#codeStartsWith(code, arg) }, (arg, command) => {
            return this.#pass(arg, this.#starToDot(this.#chomp(command, code)))
        })
    }
    _api_distributionVersion() {
        let code = "*#13**24##"
        this.#push(code, (arg) => { return this.#codeStartsWith(code, arg) }, (arg, command) => {
            //version_d
            return this.#pass(arg, this.#starToDot(this.#chomp(command, code)))
        })
    }
    // "*#13**19##" / __aeabi_idi
    // "*#13**20##" / PIC version
    // "*#13**22##" / current time
}

module.exports = {
    run(name) {
        return new Promise((resolve, reject) => {
            const ow = new OpenWebnet(this.password, this.ipAddress)
            if (ow['_api_' + name]) {
                ow['_api_' + name].apply(ow, arguments)
                ow.run(resolve, reject)
            } else {
                reject("This function does not exist: " + name)
            }
        })
    },
    ip(ip) {
        this.ipAddress = ip
        return this
    },
    pwd(pwd) {
        this.password = pwd
        return this
    }
}
