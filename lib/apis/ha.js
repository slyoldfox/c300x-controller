const config = require('../../config')
const utils = require('../utils')

module.exports = class Api {
	path() {
		return "/homeassistant"
	}

	description() {
		return "Home assistant proxy"
	}

	handle(request, response, url, q) {
		if(!q.raw || q.raw !== "true" ) {
			response.write("<br/>Call this url with &raw=true")
		} else {
			if(q.domain && q.service && q.entities) {
				var postData = JSON.stringify({
					'entity_id' : q.entities.split(',').map(e => e.trim())
				});
				utils.requestPost(config.homeassistant.url + `/api/services/${q.domain}/${q.service}`, postData, config.homeassistant.token).then((value) => {
					response.end()
				})
			} else if (q.items !== undefined ) {
				const responseItem = {}
				const dataItem = {}
				const calls = []
				
				q.items.toString().length > 0 ? q.items.toString().split(',').map((item) => {
					const functionName = item?.trim()
					const apiName = "_api_" + functionName
					try {
						var fu = this[apiName]
						if(fu) {
							calls.push(fu.apply(this, [ functionName, dataItem ]))
						} else {
							dataItem[functionName] = []
						}
					} catch( e ) {
						console.error("Error in function: " + apiName, e)
					}
				}) : []

				response.setHeader("Content-Type", "application/json; charset=utf-8")
				Promise.all(calls).then( () => {
					responseItem["preventReturnToHomepage"] = config.homeassistant.preventReturnToHomepage?.toString() === "true"
					responseItem["refreshInterval"] = config.homeassistant.refreshInterval || 2000
					if(Object.keys(dataItem).length == 0 ) {
						responseItem["data"] = { badges: [ { "state": "!!! Fix !!!\nconfig.json" } ]}
					} else {
						responseItem["data"] = dataItem
					}
					
					response.write(JSON.stringify(responseItem))	
				}).finally(() => {
					response.end()
				})
			} else {
				response.write("url not supported.")
				response.end()
			}
		}
	}

	_api_badges(name, responseItem) {
		return this.#buildEntityState(config.homeassistant.badges, name, responseItem, (entity, sensor) => {
			 return { "state": this.#parseEntityState(entity, sensor["state"]) }
		})
	}

	_api_switches(name, responseItem) {
		return this.#buildEntityState(config.homeassistant.switches, name, responseItem, (entity, sensor) => {
			return { "entity_id": sensor.entity_id, "domain": sensor.domain, "name": sensor.name, "state": this.#parseEntityState(entity, sensor["state"]) === "on" }
		})
	}

	_api_buttons(name, responseItem) {
		return this.#buildEntity(config.homeassistant.buttons, name, responseItem)
	}

	_api_images(name, responseItem) {
		return this.#buildEntity(config.homeassistant.images, name, responseItem)
	}

	#buildEntityState(configItem, name, responseItem, result) {
		return new Promise((resolve) => {
			if( !configItem ) {
				resolve()
				return;
			}
			const requests = []
			for(const sensor of configItem) {
				var apiUrl
				if( typeof sensor === 'object' ) {
					if( sensor.url ) {
						apiUrl = sensor.url
					} else if(sensor.entity_id) {
						apiUrl = config.homeassistant.url + `/api/states/${sensor.entity_id}`
					}
				} else {
					apiUrl = config.homeassistant.url + `/api/states/${sensor}`
				}
				if(apiUrl) {
					const r = utils.requestGet(apiUrl, config.homeassistant.token ).then((v) => {
						const entity = JSON.parse( v )
						const whenCondition = sensor["when"]
						if(whenCondition) {
							const result = new Function('$state', 'return (' + whenCondition + ');' )(entity.state)
							if( !result ) {
								// skip
								return;
							}
						}
						return result(entity, sensor)
					})
					requests.push(r)
				}
			}
			Promise.all(requests).then((values) => {
				responseItem[name] = values.filter((v) => v !== undefined)
			}).catch((e) => {
				console.error(e)
			}).finally(() => {
				resolve()
			})
		})
	}
	
	#buildEntity(configItem, name, responseItem) {
		return new Promise((resolve) => {
			if( !configItem ) {
				resolve()
				return;
			}					
			responseItem[name] = configItem
			return resolve();
		})
	}

	#resolveJsonP(obj, field) {
		return field.split('.').reduce((o, key) => (o && o[key] !== undefined) ? o[key] : undefined, obj);
	}

	#parseEntityState(obj, field) {
		if(typeof field === 'object') {
			if( Array.isArray(field) ) {
				return field.map( (value)  => {
					return this.#parseEntityState(obj, value)
				}).join( "" )
			}
		} else {
			if( field ) {
				if( field.indexOf("f:") >= 0 ) {
					return this.#resolveJsonP(obj, field.substring(2))
				} else {
					return field
				}
			} else {
				return this.#resolveJsonP(obj, "state" )
			}
		}
	}
}
