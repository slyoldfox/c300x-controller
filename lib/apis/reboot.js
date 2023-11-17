module.exports = class Api {
    path() {
        return "/reboot"
    }

    description() {
        return "Reboots the unit"
    }

    handle(request, response, url, q) {
        response.write("<pre>")
        if (q.now === '') {
            response.write("Rebooting in 5 seconds")
            setTimeout(() => {
                require('child_process').exec('/sbin/shutdown -r now', (msg) => { console.log(msg) });
            }, 5000)
        } else {
            response.write("<a href='./reboot?now'>Reboot now</a>")
        }
        response.write("</pre>")
    }
}
