const config = require('../../config')
const utils = require('../utils')
const haWs = require('../ha-ws')
const dayjs = require('dayjs')

const ENTITY_REGEX = /\$\(\s*([a-zA-Z0-9\_]+)\.([a-zA-Z0-9\_]+)\s*\)/g
const SUPPORTED_TYPES = ["badges","images","switches","buttons","flow"]
let CACHED_ENTITY_STATES = new Map()
let CACHED_ENTITY_HISTORY_STATES = new Map()

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
            } else if(q.dump) {
                response.setHeader("Content-Type", "application/json; charset=utf-8")

                this.#collectEntityStates().then( () => {
                    response.write(JSON.stringify(Array.from(CACHED_ENTITY_STATES.values())))
                    response.end()
                } )

			} else {
				const responseItem = {}
				const responsePages = []

                response.setHeader("Content-Type", "application/json; charset=utf-8")

                this.#collectEntityStates().then( () => {
                    config.homeassistant.pages?.forEach((page, index) => {
                        const dataItem = {}
                        SUPPORTED_TYPES.forEach( pageType => {
                            const apiName = "_api_" + pageType
                            try {
                                var fu = this[apiName]
                                if(fu) {
                                    if( page[pageType]?.items ) {
                                        fu.apply(this, [CACHED_ENTITY_STATES, page[pageType], pageType, dataItem ]);
                                    }
                                } else {
                                    dataItem[pageType] = []
                                }
                            } catch( e ) {
                                 console.error("Error in function: " + apiName, e)
                            }
                        })
                        responsePages.push(dataItem)	
                    });

                    responseItem["preventReturnToHomepage"] = config.homeassistant.preventReturnToHomepage?.toString() === "true"
                    responseItem["refreshInterval"] = config.homeassistant.refreshInterval || 2000
                    if(responsePages.length === 0 ) {
                        responsePages.push({ badges: [ { "state": "!!! Fix !!!\nconfig.json" } ]})		
                    }
                    responseItem["data"] = { "pages": responsePages}
                    
                } ).catch(e => {
                    console.error(e)
                })
                .finally(() => {
                    response.write(JSON.stringify(responseItem))
                    response.end()
                })
			}
		}
	}

    _api_flow( entityStates, pageItem, pageType, responseItem) {
        const flowItem = { "period": pageItem.period, "starttime": this.#parseDaysJs(pageItem.starttime), "endtime": this.#parseDaysJs(pageItem.endtime) }

        responseItem["flow"] = flowItem
        const lineItems = []
        this.#buildEntityState(entityStates, pageItem?.items, "items", flowItem, (entity, sensor) => {
            sensor.lines?.forEach(line => {
                lineItems.push( this.#createLineObject(line) )
            })
            var state = this.#parseEntityState(entity, sensor["state"])
            return this.#createFlowObject(sensor, state);
        })
        this.#applyQmlProperties( flowItem, pageItem )

        flowItem["lines"] = lineItems
    }

	_api_badges( entityStates, pageItem, pageType, responseItem) {
		this.#buildEntityState(entityStates, pageItem?.items, pageType, responseItem, (entity, sensor) => {
			 return { "state": this.#parseEntityState(entity, sensor["state"]) }
		})
	}

	_api_switches( entityStates, pageItem, pageType, responseItem) {
		this.#buildEntityState(entityStates, pageItem?.items, pageType, responseItem, (entity, sensor) => {
			return { "entity_id": sensor.entity_id, "domain": sensor.domain, "name": sensor.name, "state": this.#parseEntityState(entity, sensor["state"]) === "on" }
		})
	}

	_api_buttons(entityStates, pageItem, pageType, responseItem) {
		this.#buildEntity(pageItem?.items, pageType, responseItem)
	}

	_api_images(entityStates, pageItem, pageType, responseItem) {
		this.#buildEntity(pageItem?.items, pageType, responseItem)
	}

    #collectEntityStates() {
        return new Promise((resolve,reject) => {
            utils.requestGet(config.homeassistant.url + '/api/states', config.homeassistant.token).then(e => {
                const entityStates = new Map()
                const entities = JSON.parse( e, this.#typedJsonReviver )
                entities.forEach( entity => {
                    entityStates.set(entity.entity_id, entity)
                } )
                CACHED_ENTITY_STATES = entityStates

                this.#collectEntityStatistics(() => {
                    resolve()
                })
            })
            .catch( e => {
                reject(e)
            })
        })
    }

    #collectEntityStatistics(callback) {
        const entityStatistics = new Map()
        const statisticsQueries = []
        config.homeassistant.pages?.forEach((page, index) => {
            const flowPage = page["flow"]
            if(flowPage && flowPage["period"] ) {
                const stateEntityHistory = []
                flowPage?.items?.forEach(item => {
                    var entity_id = item.entity_id
                    if(entity_id) {
                        stateEntityHistory.push( entity_id )
                    } else if(item.formula) {
                        const matches = item.formula.match(ENTITY_REGEX)
                        if( matches ) {
                            var unique = new Set(item.formula.match(ENTITY_REGEX)?.map( item => item.substring(2, item.length - 1) ))
                            stateEntityHistory.push(...unique)                            
                        }
                    }
                })

                const wsQuery = haWs.query(stateEntityHistory, flowPage["period"], this.#parseDaysJs( flowPage["starttime"] ), this.#parseDaysJs( flowPage["endtime"] ))
                statisticsQueries.push(wsQuery)
                wsQuery.then(entities => {
                    stateEntityHistory.forEach(itemName => {
                        const x = CACHED_ENTITY_STATES.get(itemName)
                        if( !x ) {
                            console.log(x)
                        }
                        const entityStates = entities[itemName]
                        const count = entityStates.length
                        let min = undefined, max = 0, sum = 0

                        entityStates.forEach(item => {
                            item.change < min || min === undefined ? min = item.change : item.change
                            item.change > max ? max = item.change : item.change
                            sum += item.change
                        })
                        const avg = count > 0 ? (sum / count) : 0
                
                        const entityObject = { sum, avg, min, max, count }
                        entityStatistics.set(itemName, entityObject)
                        x["statistics"] = entityObject
                    })
                })
            }
        })
        Promise.all(statisticsQueries).then( () => {
            CACHED_ENTITY_HISTORY_STATES = entityStatistics
            callback()
        })
    }

	#buildEntityState(entityStates, configItem, pageType, responseItem, callback) {
        if(configItem.length === 0) {
            responseItem[pageType] = []
        } else {
            const values = []
            for(const sensor of configItem) {
                const entity = entityStates.get(sensor.entity_id)
                if(entity) {
                    if(sensor.formula && !entity.calculatedState) {
                        entity.calculatedState = this.#applyFormula(responseItem, entityStates, sensor)
                    } 
                
                    const result = this.#applyConditions(responseItem, entityStates, sensor, entity, callback)
                    values.push(result)
                }
            }
            
            configItem.filter( e => (e.formula !== undefined && e.entity_id === undefined )).forEach( sensor => {
                const calculatedState = this.#applyFormula(responseItem, entityStates, sensor)
                const entity = { "state": calculatedState }
                const result = this.#applyConditions(responseItem, entityStates, sensor, entity, callback)
                values.push(result)
            } )                
        
            responseItem[pageType] = values.filter((v) => v !== undefined)
        }
	}
	
	#buildEntity(configItem, pageType, responseItem) {
        responseItem[pageType] = configItem				
	}

    #applyFormula(responseItem, entityStates, sensor, field) {
        const fieldValue = field || sensor.formula
        const formula = fieldValue.replace(ENTITY_REGEX,'$$$1___$2')
        const sensors = [...new Set(fieldValue.match(ENTITY_REGEX))];
        const variableNames = sensors.map(e => e.replace(ENTITY_REGEX,'$$$1___$2'))
        const sensorValues = sensors.map( (sensor) => {
                return entityStates.get( sensor.substring(2, sensor.length -1))
        } )
        const result = new Function(variableNames, 'return ( ' + formula + ' ); ')(...sensorValues)
        return result        
    }

    #applyConditions( responseItem, entityStates, sensor, entity, callback) {
        const whenCondition = sensor["when"]
        if(whenCondition) {
            const result = this.#applyFormula(responseItem, entityStates, sensor, whenCondition)
            if( !result ) {
                // skip
                return;
            }
        }
        return callback(entity, sensor)        
    }

    #createFlowObject(sensor, state) {
        const obj = { "state": state }
        this.#applyQmlProperties(obj, sensor)
        return obj;        
    }

    #createLineObject(line) {
        const obj = { startX: line.startX, startY: line.startY, x: line.endX, y: line.endY }

        obj["controlX"] = line.controlX || this.#deduceControl(obj, "controlX")
        obj["controlY"] = line.controlY || this.#deduceControl(obj, "controlY")
        obj["numberOfDots"] = line.numberOfDots || this.#calculateLineLength(obj)
        obj["lineColor"] = line.color || "black"
        obj.toString = function() {
            return `startX:${this.startX},startT:${this.startY},endX:${this.x},endY:${this.y},controlX:${this.controlX},controlY${this.controlY}`;
        }        
        return obj;        
    }

    #calculateLineLength(line) {
        if(line.startY === line.y) {
            return Math.abs(line.x - line.startX)
        } else if(line.startX === line.x) {
            return Math.abs(line.y - line.startY)
        } else {
            //var l = this.#bezierLength(line.startX, line.startY, line.controlX, line.controlY, line.x, line.y)
            // Average quadratic bezier curve length
            return 120
        }
    }

    #bezierLength(x0, y0, cx, cy, x1, y1, steps = 100) {
        function bezierDerivative(t) {
            const dx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx);
            const dy = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy);
            return { dx, dy };
        }
    
        function distance(dx, dy) {
            return Math.sqrt(dx * dx + dy * dy);
        }
    
        let length = 0;
        let prevPoint = bezierDerivative(0);
    
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const currentPoint = bezierDerivative(t);
            const segmentLength = distance(currentPoint.dx - prevPoint.dx, currentPoint.dy - prevPoint.dy);
            length += segmentLength;
            prevPoint = currentPoint;
        }
    
        return length;
    }    

    #deduceControl(line, propertyName) {
        const axis = propertyName[propertyName.length-1];
        switch(axis) {
            case "X":
                return (line.startX === line.x) ? line.startX : (line.startX + line.x) / 2
            case "Y":
                return (line.startY === line.y) ? line.startY : (line.startY + line.y) / 2
        }
        return NaN
    }

    #applyQmlProperties(obj, sensor) {
        if(!sensor) return;
        Object.keys(sensor).forEach(item => {
            if(item[0] === '$') {
                obj[item.substring(1)] = sensor[item]
            }
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

    #parseDaysJs( dayJsAsString ) {
        return new Function( ["dayjs"], "return " + dayJsAsString)(dayjs)
    }

    #typedJsonReviver(key, value) {
        if (typeof value === 'string') {
            const numberValue = Number(value);
            if (!isNaN(numberValue)) {
                return numberValue;
            }

            if(value.includes("T") && value.includes(":")) {
                const dateValue = new Date(value);
                if (!isNaN(dateValue.getTime()) ) {
                    return dateValue;
                }
            }
        }
        return value;
    }    
}
