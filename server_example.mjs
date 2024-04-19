//replace with "@mercuryworkshop/wisp-js/server"
import { server as wisp } from "./src/entrypoints/server.mjs";
import http from "node:http";

const server = http.createServer();

server.on("upgrade", (req, socket, head) => {
  wisp.routeRequest(req, socket, head);
});

server.on("listening", () => {
  console.log("HTTP server listening");
});

server.listen({
  port: 5001,
});