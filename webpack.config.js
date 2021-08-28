const webpack = require('webpack');
//const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = (env, argv) => ({
  name: 'main',
  mode: argv.mode || 'development',
  entry: './src/main.ts',
  devtool: argv.mode !== 'production' ? "source-map" : undefined,
  stats: {
    hash: false, version: false, modules: false  // reduce verbosity
  },
  output: {
    filename: 'main.js',
    path: `${__dirname}/dist`
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader'
      }
    ],
  },
  resolve: {
    extensions: [ '.ts', '.js' ],
    fallback: {
        url: false, crypto: false, tty: false, worker_threads: false,
        path: require.resolve("path-browserify"),
        stream: require.resolve("stream-browserify"),
    }
  },
  externals: {
    fs: 'commonjs2 fs'
  },
  plugins: [
    new webpack.DefinePlugin({ 'process': {browser: true, env: {}} }),
    new webpack.ProvidePlugin({ 'Buffer': ['buffer', 'Buffer'] }),
    //new BundleAnalyzerPlugin()
  ]
});
