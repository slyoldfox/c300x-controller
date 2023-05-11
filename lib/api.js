"use strict";

// There might be an API here someday to expose internal functionality
const http = require("http");
const querystring = require('querystring');
const url = require('url')
const fs =  require("fs");
var normalizedPath = require("path").join(__dirname, "apis");

require("fs").readdirSync(normalizedPath).forEach((file) => {
  require("./apis/" + file);
});

const apis = []

class Api {
    createServer(registry) {
	this.registry = registry
	this.apis = new Map()
	fs.readdirSync(normalizedPath).forEach((file) => {
  		const API = require("./apis/" + file);
		const api = new API()
		if( api.endpointRegistry ) {
			api.endpointRegistry( this.registry )
		}
		var path = api.path()
		if( path.length > 0 ) {
			if( path[0] != '/' )
				 path = '/' + path
			if( apis[path] ) {
				console.log("Path already taken by another API")
			} else {
				console.log("API> " + path + " file: " + file)	
			}
		}
		this.apis.set(path.toString(), api )
	})
	var server = http.createServer((request, response) => {
		console.log("API called url: " + request.url )
		let parsedUrl = url.parse(request.url)
		let q = parsedUrl?.query ? querystring.parse(parsedUrl.query) : {}
		if( parsedUrl.pathname === '/' ) {
			response.writeHead(200, {"Content-Type": "text/html"})
			response.write('<!doctype html><html lang=en><head><meta charset=utf-8><title>Bticino API</title><link href="https://vjs.zencdn.net/8.0.4/video-js.css" rel="stylesheet" /></head></body>')
			if( this.apis.size == 0 ) {
				response.write("No APIs found")
			} else {
				response.write("<ul>")
				this.apis.forEach( (value, key) => {
					response.write("<li><a href='." + key + "'>" + value.description()+ "</a></li>")
				});
				response.write("</ul>")
			}
			response.write("</body></html>")
		} else {
			var api = this.apis.get(parsedUrl.pathname)
			if( api ) {
				try {
					if( !q.raw ) {
						response.writeHead(200, {"Content-Type": "text/html"})
						response.write("<!doctype html><html lang=en><head><meta charset=utf-8><title>Bticino API</title>")
						response.write('<link href="https://vjs.zencdn.net/8.0.4/video-js.css" rel="stylesheet" /></head><body>')
						response.write("<a href='./'><< Back</a>")
					}
					api.handle(request, response, parsedUrl, q)
					if( !q.raw ) {
						response.write("</body></html>")
					}
				} catch(e) {
					console.error(e)
					response.write(e.message)
				}
			} else {
				response.writeHead(404, {"Content-Type": "text/plain"});
				response.write("404")
			}
		}
		if( !q.raw )
			response.end()
	});
	server.listen(8080, '0.0.0.0'); // Don't bother with IPv6
	console.log("API listening on port 8080 for requests")
    }
}

module.exports = {
   create(registry) {
	new Api().createServer(registry)
   }
}
