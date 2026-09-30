const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
module.exports = {
  entry: "./src/module.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "module.js",
    library: { type: "amd" },
    uniqueName: "umar-prettypino-app",
    devtoolNamespace: "umar-prettypino-app",
    clean: true,
    publicPath: "auto",
  },
  externals: [
    "react",
    "react-dom",
    "@grafana/data",
    "@grafana/runtime",
    "rxjs",
  ],
  resolve: { extensions: [".tsx", ".ts", ".js"] },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        options: { compilerOptions: { noEmit: false } },
        exclude: /node_modules/,
      },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "src/plugin.json", to: "plugin.json" },
        { from: "src/img", to: "img" },
        { from: "artifacts/log-sidebar.png", to: "img/screenshot.jpg" },
        { from: "README.md", to: "README.md" },
        { from: "CHANGELOG.md", to: "CHANGELOG.md" },
      ],
    }),
  ],
  devtool: "source-map",
};
