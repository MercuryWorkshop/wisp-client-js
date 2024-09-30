#!/usr/bin/env node

import http from "node:http";
import path from "node:path";
import { promises as fs } from "fs";

import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import { createRequire } from "module";
import { Command } from "commander";

//find own program version from package.json
//https://stackoverflow.com/a/76782867/21330993
const package_json = createRequire(import.meta.url)("./../../package.json");
const version = package_json.version;

//parse arguments
const program = new Command();
program
  .name("wisp-js-server")
  .description(`A Wisp server implementation written in Javascript. (v${version})`)
  .version(version);

program
  .option("-H, --host <host>", "The hostname the server will listen on.", "127.0.0.1")
  .option("-P, --port <port>", "The port number to run the server on.", parseInt(process.env.PORT || "5001"))
  .option("-L, --logging <log_level>", "The log level to use. This is either DEBUG, INFO, WARN, ERROR, or NONE.", "INFO")
  .option("-S, --static <static_dir>", "The directory to serve static files from. (optional)")
  .option("-C, --config <config_path>", "The path to your Wisp server config file. This is the same format as `wisp.options` in the API. (optional)")
  .option("-O, --options <options_json>", "A JSON string to set the Wisp config without using a file. (optional)");

program.parse();
const opts = program.opts();

//set up server settings
opts.logging = opts.logging.toUpperCase();
if (["DEBUG", "INFO", "WARN", "ERROR", "NONE"].includes(opts.logging)) {
  logging.set_level(logging[opts.logging]);
}
else {
  console.error("Invalid log level: " + opts.logging);
  console.error("Valid choices: DEBUG, INFO, WARN, ERROR, NONE");
  process.exit(1);
}

if (opts.static) {
  opts.static = path.resolve(opts.static);
  logging.info("Serving static files from: " + opts.static);
}

if (opts.config) {
  opts.config = path.resolve(opts.config);
  logging.info("Using config file: " + opts.config);

  let data = await fs.readFile(opts.config);
  let config = JSON.parse(data);
  for (let [key, value] of Object.entries(config))
    wisp.options[key] = value;
}

if (opts.options) {
  opts.options = JSON.parse(opts.options);
  for  (let [key, value] of Object.entries(opts.options))
    wisp.options[key] = value;
}

//start the wisp server 
const mime_types = {
  "ico": "image/x-icon",
  "html": "text/html",
  "js": "text/javascript",
  "mjs": "text/javascript",
  "json": "application/json",
  "css": "text/css",
  "png": "image/png",
  "jpg": "image/jpeg",
  "wav": "audio/wav",
  "mp3": "audio/mpeg",
  "svg": "image/svg+xml",
  "pdf": "application/pdf",
  "zip": "application/zip",
  "ttf": "application/x-font-ttf"
};

const server = http.createServer(async (req, res) => {
  let client_ip = req.socket.address().address;
  let real_ip = wisp.parse_real_ip(req.headers, client_ip);
  logging.info(`HTTP ${req.method} ${req.url} from ${real_ip}`)

  if (!opts.static) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("wisp-js-server is running");
    return  
  }

  try {
    let parsed_url = new URL(req.url, "http://localhost/");
    let served_path = path.join(opts.static, parsed_url.pathname);

    let path_stat = await fs.stat(served_path);
    if (path_stat.isDirectory()) {
      served_path = path.join(served_path, "index.html");
    }

    let data = await fs.readFile(served_path);
    let file_ext = served_path.split(".").reverse()[0];
    let content_type = mime_types[file_ext] || "application/octet-stream";

    res.writeHead(200, {"Content-Type": content_type});
    res.end(data);
  }

  catch (err) {
    if (err.code == "ENOENT") {
      res.writeHead(404, {"Content-Type": "text/plain"});
      res.end("404 not found");
    }
    else {
      res.writeHead(500, {"Content-Type": "text/plain"});
      res.end("500 internal server error:\n" + err);  
    }
  }
});

server.on("upgrade", (req, socket, head) => {
  wisp.routeRequest(req, socket, head);
});

server.on("listening", () => {
  logging.info(`HTTP server listening on ${opts.host}:${opts.port}`);
});

server.listen(parseInt(opts.port), opts.host);