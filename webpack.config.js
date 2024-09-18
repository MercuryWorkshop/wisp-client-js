const stats_options = {
  orphanModules: true,
  modulesSpace: Infinity
}

const webpack_configs = [
  {
    name: "client",
    entry: "./src/entrypoints/client.mjs",
    output: {
      filename: "wisp-client.js",
      library: {
        name: "wisp_client",
        type: "var"
      }
    },
    mode: "development",
    stats: stats_options,
    optimization: {mangleExports: false}
  },
  {
    name: "server",
    entry: "./src/entrypoints/server.mjs",
    output: {
      filename: "wisp-server.js",
      library: {
        name: "wisp_server",
        type: "var"
      }
    },
    mode: "development",
    stats: stats_options,
    optimization: {mangleExports: false}
  }
]

//add es6 module output to each webpack configuration object
let new_configs = [];
for (let config of webpack_configs) {
  let new_config = Object.fromEntries(Object.entries(config));
  new_config.name = config.name + "_es6";
  new_config.experiments = {outputModule: true};
  new_config.output = {
    filename: config.output.filename.replace(".js", ".mjs"),
    library: {
      type: "module"
    }
  }
  new_configs.push(new_config)
}

module.exports = webpack_configs.concat(new_configs);