const ShebangPlugin = require('webpack-shebang-plugin');

module.exports = (env, argv) => {
    const production = argv.mode === 'production'
    return {
        devtool: production ? undefined : 'source-map',
        mode: 'development',
        entry: './controller.js',
        target : 'node',
        output: {
            path: __dirname + '/dist',
            filename: production ? 'bundle.js' : 'bundle_dev.js'
        },
        plugins: [ new ShebangPlugin() ]
    }
}