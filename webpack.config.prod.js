const nodeExternals = require('webpack-node-externals');
const CopyPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const webpack = require('webpack');
const fs = require('fs');

const appConfig = JSON.parse(fs.readFileSync('./config/appconfig.json', 'UTF-8'));

module.exports = {
  mode: 'production',
  plugins: [
    new webpack.EnvironmentPlugin({
      NODE_ENV: 'production', // use 'development' unless process.env.NODE_ENV is defined
      DEBUG: false,
    }),
    new CopyPlugin([
      { from: appConfig.jsonFile, to: './db.json' },
      { from: './config/appconfig.json', to: './config/appconfig.json' },
    ]),
  ],
  entry: { 'src/server/handler': './src/server/handler.js' },
  optimization: {
    minimizer: [new TerserPlugin()],
  },
  target: 'node',
  externals: [nodeExternals()],
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
};
