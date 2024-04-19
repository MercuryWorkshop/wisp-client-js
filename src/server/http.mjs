import { WispConnection } from "./connection.mjs";
import { is_node, assert_on_node } from "./net.mjs";
import { WSProxyConnection } from "./wsproxy.mjs";

let IncomingMessage = null;
let NodeWebSocket = null;
let WebSocketServer = null;

let ws_server = null;
if (is_node) {
  IncomingMessage = await import("node:http").IncomingMessage;
  WebSocketServer = await import("ws").WebSocketServer;
  NodeWebSocket = await import("ws").WebSocket;
  ws_server = await new WebSocketServer({ noServer: true });
}

export function routeRequest(request, socket, head) {
  assert_on_node();

  if (request instanceof IncomingMessage) {
    ws_server.handleUpgrade(request, socket, head, (ws) => {
      create_connection(ws, path);
    });
  }
  if (request instanceof NodeWebSocket) {
    create_connection(ws, "/")
  }
}

async function create_connection(ws, path) {
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