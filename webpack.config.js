const ShebangPlugin = require('webpack-shebang-plugin');

module.exports = {
    devtool: 'source-map',
    mode: 'development',
    entry: './controller.js',
    target : 'node',
    output: {
        path: __dirname + '/dist',
        filename: 'bundle.js'
    },
    plugins: [ new ShebangPlugin() ]
};