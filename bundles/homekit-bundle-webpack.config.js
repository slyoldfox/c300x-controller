// Used to regenerate homekit-bundle.js from homekit-manager.ts

const webpack = require('webpack');
const header =
`// =======================================================================================================================
// DO NOT EDIT, this is a generated file, generate it with $ npm run build:homekitbundle:dev or npm run build:homekitbundle:prod
// =======================================================================================================================`

const TerserPlugin = require('terser-webpack-plugin')

module.exports = [
    (env, argv) => {
        return {
            devtool: 'source-map',
            mode: 'production',
            entry: [ __dirname + '/homekit-manager.ts'],
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
                path: __dirname + '/../lib/homekit',
                filename: 'homekit-bundle.js',
                libraryTarget: 'this',
            },
          optimization: {
              minimizer: [new TerserPlugin({ extractComments: false })],
          },            
         plugins: [ new webpack.BannerPlugin({banner: header, raw: true, stage: webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT}) ]
        }    
    }
]