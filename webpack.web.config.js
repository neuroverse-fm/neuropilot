/* eslint-disable */
const path = require('path');

/** @type {import('webpack').Configuration} */
module.exports = {
    // 1) We target a WebWorker, because vscode.dev runs extensions in a Worker context.
    target: 'webworker',

    // 2) The entrypoint of your web extension:
    entry: './src/web/extension.ts',

    // 3) Output a single bundle into dist/extension-web.js
    output: {
        filename: 'extension.js',
        path: path.resolve(__dirname, 'out/web'),
        libraryTarget: 'commonjs2',
    },

    // 4) Generate source maps if you like:
    devtool: 'source-map',

    // 5) Resolve .ts and .js
    resolve: {
        extensions: ['.ts', '.js']
    },

    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: {
                    loader: 'ts-loader',
                    options: {
                        configFile: 'tsconfig.web.json'
                    },
                },
            },
        ],
    },

    // 6) Don’t bundle the 'vscode' module; the host will provide it.
    externals: {
        vscode: 'commonjs vscode',
    },
};
