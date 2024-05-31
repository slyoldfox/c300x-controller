const openwebnet = require('./openwebnet')

// If you want to test the openwebnet.js calls do this:
// ssh -L127.0.0.1:20000:127.0.0.1:20000 root2@192.168.0.X where the IP is the one from the intercom
// For remote calls you can use: openwebnet.ip('192.168.0.X').pwd("123456789").run("ipAddress")
let call = openwebnet.run("ipAddress")
call.then((x) => console.info("result: " + x))