const ShebangPlugin = require('webpack-shebang-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const fs = require('fs')

const path = __dirname + '/lib/sip/sip-bundle.js'

if( !fs.existsSync(path) ) {
    throw new Error(`\n\n*** SIP bundle does not exist at ${path}\n*** To create it run: npm run build:sipbundle:dev or npm run build:sipbundle:prod\n`)
}

module.exports = [
    (env, argv) => {
        const production = argv.mode === 'production'
        return {
            devtool: production ? undefined : 'source-map',
            mode: 'development',
            entry: {
                'bundle': './controller.js',
                'bundle-webrtc': './controller-webrtc.js',
                'bundle-homekit': './controller-homekit.js'
            },
            target : 'node',
            output: {
                path: __dirname + '/dist',
                filename: production ? '[name].js' : '[name]_dev.js'
            },
            optimization: {
                // Avoids generating license files
                minimizer: [new TerserPlugin({ extractComments: false })],
            },            
            plugins: [ new ShebangPlugin() ]
        }
    }
]