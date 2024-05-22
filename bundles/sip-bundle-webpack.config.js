// Used to regenerate sip-bundle.js from sip-manager.ts

const webpack = require('webpack');
const header =
`// =======================================================================================================================
// DO NOT EDIT, this is a generated file, generate it with $ npm run build:sipbundle:dev or npm run build:sipbundle:prod
// =======================================================================================================================`

module.exports = [
    (env, argv) => {
        return {
            devtool: 'source-map',
            mode: 'production',
            entry: [ __dirname + '/sip-manager.ts'],
            module: {
                rules: [
                  {
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                    exclude: /node_modules/,
                  },
                ],
              }, 
            target : 'node',
            output: {
                path: __dirname + '/../lib/sip',
                filename: 'sip-bundle.js',
                libraryTarget: 'this',
            },
         plugins: [ new webpack.BannerPlugin({banner: header, raw: true, stage: webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT}) ]
        }    
    }
]