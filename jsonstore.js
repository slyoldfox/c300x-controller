const fs = require('fs');

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
        }
    }

    save() {
        try {
            const data = JSON.stringify(this.data, null, 2);
            fs.writeFileSync(this.filePath, data);
        } catch (err) {
            console.error('Error saving data:', err);
        }
    }

    read(key) {
        return this.data[key];
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