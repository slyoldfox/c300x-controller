const fs = require('fs');

function replacer(key, value) {
    if(key[0] !== '$' ) return value
}

class JSONStore {
    constructor(filePath) {
        this.filePath = filePath;
        this.data = {};

        // Load data from file if it exists
        this.load();
    }

    load() {
        if( !fs.existsSync(this.filePath) ) {
            fs.writeFileSync(this.filePath, '{}');
        }
        try {
            const data = fs.readFileSync(this.filePath);
            this.data = JSON.parse(data);
        } catch (err) {
            console.error('Error loading data:', err);
            throw err
        }
    }

    save() {
        try {
            const data = JSON.stringify(this.data, replacer, 2);
            fs.writeFileSync(this.filePath, data);
        } catch (err) {
            console.error('Error saving data:', err);
        }
    }

    read(key, defaults) {
        let data = this.data[key];
        if( !data ) {
            data = defaults()
            this.write(key, data)
        }
        return data
    }

    write(key, value) {
        this.data[key] = value;
        this.save();
    }
}

module.exports = {
    create(filepath) {
        return new JSONStore(filepath)
    }
}