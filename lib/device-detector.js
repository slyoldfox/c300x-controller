const fs = require("fs")
const filestore = require('../json-store')

const C100X_MODULES = "/home/bticino/cfg/extra/.bt_eliot/mymodules"

class DeviceDetector {
    constructor(mymodulesPath = C100X_MODULES) {
        this.mymodulesPath = mymodulesPath
        this.devices = null
    }

    static create(mymodulesPath) {
        return new DeviceDetector(mymodulesPath)
    }

    _loadDevices() {
        if (this.devices !== null) {
            return this.devices
        }

        if (!fs.existsSync(this.mymodulesPath)) {
            console.log(`[DeviceDetector] mymodules file not found at ${this.mymodulesPath}`)
            this.devices = []
            return this.devices
        }

        try {
            const store = filestore.create(this.mymodulesPath)
            this.devices = store.data.modules || []
            console.log(`[DeviceDetector] Loaded ${this.devices.length} devices from ${this.mymodulesPath}`)
        } catch (e) {
            console.error(`[DeviceDetector] Error reading mymodules file: ${e.message}`)
            this.devices = []
        }

        return this.devices
    }

    detectCameras() {
        const devices = this._loadDevices()
        const cameras = devices.filter(m => 
            m.system === 'videodoorentry' && 
            m.deviceType === 'EU' &&
            m.privateAddress?.addressValues?.length > 0
        ).map(m => {
            const addressValue = m.privateAddress.addressValues.find(a => a.name === 'address')
            return {
                id: m.id,
                deviceId: addressValue?.value,
                name: m.name,
                buttonId: m.privateAddress.buttonId,
                visible: m.privateAddress.visible
            }
        }).filter(c => c.deviceId !== undefined)

        console.log(`[DeviceDetector] Detected ${cameras.length} camera(s):`, cameras.map(c => `${c.name} (ID: ${c.deviceId})`).join(', '))
        return cameras
    }

    detectLocks() {
        const devices = this._loadDevices()
        const locks = devices.filter(m => 
            m.system === 'automation' && 
            m.device === 'lock' &&
            m.privateAddress?.addressValues?.length > 0
        ).map(m => {
            const addressValue = m.privateAddress.addressValues.find(a => a.name === 'address')
            return {
                id: m.id,
                deviceId: addressValue?.value,
                name: m.name,
                buttonId: m.privateAddress.buttonId,
                visible: m.privateAddress.visible
            }
        }).filter(l => l.deviceId !== undefined)

        console.log(`[DeviceDetector] Detected ${locks.length} lock(s):`, locks.map(l => `${l.name} (ID: ${l.deviceId})`).join(', '))
        return locks
    }

    detectInternalUnit() {
        const devices = this._loadDevices()
        const internalUnits = devices.filter(m => 
            m.system === 'videodoorentry' && 
            m.deviceType === 'IU'
        ).map(m => {
            return {
                id: m.id,
                deviceId: m.privateAddress?.addressValues?.find(a => a.name === 'address')?.value,
                EUaddress: m.EUaddress
            }
        })

        if (internalUnits.length > 0) {
            console.log(`[DeviceDetector] Detected ${internalUnits.length} internal unit(s)`)
        }
        return internalUnits
    }
}

module.exports = DeviceDetector
