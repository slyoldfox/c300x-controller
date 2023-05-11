const fs =  require("fs");

module.exports = class Api {
    path() {
	return "/load"
    }

    description() {
	return "Displays unit temperature and load"
    }

    handle(request, response) {
	var temp = fs.readFileSync("/sys/class/thermal/thermal_zone0/temp");
        var temp_c = temp/1000;

        var load = fs.readFileSync("/proc/loadavg");
	response.write("<pre>")
        response.write("C300X cpu temperature: \n");
        response.write(temp_c + "\n\n");
        response.write("Load:\n");
        response.write(load)
	response.write("</pre>")
    }
}
