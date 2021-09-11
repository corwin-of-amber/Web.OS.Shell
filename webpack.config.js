const webpack = require('webpack');
//const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = (env, argv) => ({
  name: 'main',
  mode: argv.mode || 'development',
  entry: './src/main.ts',
  //devtool: argv.mode !== 'production' ? "source-map" : undefined,
  devtool: false,
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
        constants: require.resolve("constants-browserify"),
    }
  },
  externals: {
    fs: 'commonjs2 fs'
  },
  plugins: [
    new webpack.ProvidePlugin({Buffer: ['buffer', 'Buffer'],
                               process: 'process/browser' }),
    // for debugging with NWjs, https://github.com/nwjs/nw.js/issues/7724
    new webpack.SourceMapDevToolPlugin({
      append: `\n//# sourceMappingURL=file://${__dirname}/dist/[url]`,
      filename: '[name].map'
    }),
    //new BundleAnalyzerPlugin()
  ]
});
