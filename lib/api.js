"use strict";

// There might be an API here someday to expose internal functionality
const http = require("http");
const querystring = require('querystring');
const url = require('url')
const fs = require("fs");

const __webpack__enabled = (typeof __webpack_require__ === "function") ? true : false
var normalizedPath = require("path").join(__dirname, "apis");
const apis_path = "./apis/"

class Api {

	#apis = new Map()

	constructor(registry) {
		var req = __webpack__enabled ? require.context( "./apis/" , true, /.js$/) : fs.readdirSync(normalizedPath)
		var keys = __webpack__enabled ? req.keys() : req;
        keys.forEach( key => {
            const API = __webpack__enabled ? req( /* webpackIgnore: true */ key) : require( /* webpackIgnore: true */ apis_path + key );
			const api = new API()
			if (api.endpointRegistry) {
				api.endpointRegistry(registry)
			}
			var path = api.path()
			if (path.length > 0) {
				if (path[0] != '/')
					path = '/' + path
				if (this.#apis[path]) {
					console.log("Path already taken by another API")
				} else {
					console.log("API> " + path + " file: " + key)
				}
			}
			this.#apis.set(path.toString(), api)
		})
		var server = http.createServer((request, response) => {
			console.log("API called url: " + request.url)
			let parsedUrl = url.parse(request.url)
			let q = parsedUrl?.query ? querystring.parse(parsedUrl.query) : {}
			if (parsedUrl.pathname === '/') {
				response.writeHead(200, { "Content-Type": "text/html" })
				response.write('<!doctype html><html lang=en><head><meta charset=utf-8><title>Bticino API</title><link href="https://vjs.zencdn.net/8.0.4/video-js.css" rel="stylesheet" /></head></body>')
				if (this.#apis.size == 0) {
					response.write("No APIs found")
				} else {
					response.write("<ul>")
					this.#apis.forEach((value, key) => {
						response.write("<li><a href='." + key + "'>" + value.description() + "</a></li>")
					});
					response.write("</ul>")
				}
				response.write("</body></html>")
			} else {
				var api = this.#apis.get(parsedUrl.pathname)
				if (api) {
					try {
						if (!q.raw) {
							response.writeHead(200, { "Content-Type": "text/html" })
							response.write("<!doctype html><html lang=en><head><meta charset=utf-8><title>Bticino API</title>")
							response.write('<link href="https://vjs.zencdn.net/8.0.4/video-js.css" rel="stylesheet" /></head><body>')
							response.write("<a href='./'><< Back</a>")
						}
						api.handle(request, response, parsedUrl, q)
						if (!q.raw) {
							response.write("</body></html>")
						}
					} catch (e) {
						console.error(e)
						response.write(e.message)
					}
				} else {
					response.writeHead(404, { "Content-Type": "text/plain" });
					response.write("404")
				}
			}
			if (!q.raw)
				response.end()
		});
		server.listen(8080, '0.0.0.0'); // Don't bother with IPv6
		console.log("API listening on port 8080 for requests")
	}

	get apis() {
		return this.#apis
	}
}

module.exports = {
	create(registry) {
		return new Api(registry)
	}
}
