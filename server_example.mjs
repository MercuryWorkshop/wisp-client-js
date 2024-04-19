//replace with "@mercuryworkshop/wisp-js/server"
import { server as wisp, logging } from "./src/entrypoints/server.mjs";
import http from "node:http";

const server = http.createServer();
logging.set_level(logging.DEBUG);

server.on("upgrade", (req, socket, head) => {
  wisp.routeRequest(req, socket, head);
});

server.on("listening", () => {
  console.log("HTTP server listening");
});

server.listen({
  port: 5001
});