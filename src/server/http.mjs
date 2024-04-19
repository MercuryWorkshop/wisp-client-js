import { WispConnection } from "./connection.mjs";
import { WSProxyConnection } from "./wsproxy.mjs";
import { is_node, assert_on_node } from "./net.mjs";

let IncomingMessage = null;
let NodeWebSocket = null;
let WebSocketServer = null;

let ws_server = null;
if (is_node) {
  IncomingMessage = (await import("node:http")).IncomingMessage;
  NodeWebSocket = (await import("ws")).WebSocket;
  WebSocketServer = (await import("ws")).WebSocketServer;
  ws_server = new WebSocketServer({ noServer: true });
}

export function routeRequest(request, socket, head) {
  assert_on_node();

  if (request instanceof IncomingMessage) {
    ws_server.handleUpgrade(request, socket, head, (ws) => {
      create_connection(ws, request.url);
    });
  }
  else if (request instanceof NodeWebSocket) {
    create_connection(ws, "/");
  }
}

async function create_connection(ws, path) {
  console.log("new connection on " + path);
  if (path.endsWith("/")) {
    let wisp_conn = new WispConnection(ws, path);
    await wisp_conn.setup();
    await wisp_conn.run();
  }

  else {
    let wsproxy = new WSProxyConnection(ws, path);
    await wsproxy.setup();
  }
}