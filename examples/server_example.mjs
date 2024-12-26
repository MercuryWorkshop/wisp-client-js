import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import http from "node:http";

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("wisp-js rewrite");
});

logging.set_level(logging.DEBUG);
wisp.options.port_whitelist = [
  [5000, 6000],
  80,
  443
]
wisp.options.allow_private_ips = true;
wisp.options.allow_loopback_ips = true;

server.on("upgrade", (req, socket, head) => {
  wisp.routeRequest(req, socket, head);
});

server.on("listening", () => {
  console.log("HTTP server listening");
});

server.listen(5001, "127.0.0.1");