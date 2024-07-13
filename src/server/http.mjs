import * as logging from "../logging.mjs";
import { AccessDeniedError } from "./filter.mjs";
import { ServerConnection } from "./connection.mjs";
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

export function routeRequest(request, socket, head, options={}) {
  assert_on_node();

  if (request instanceof IncomingMessage) {
    ws_server.handleUpgrade(request, socket, head, (ws) => {
      create_connection(ws, request.url, request, options);
    });
  }
  else if (request instanceof NodeWebSocket) {
    create_connection(ws, "/", {}), options;
  }
}

async function create_connection(ws, path, request, options) {
  let client_ip = request.socket.address().address;
  logging.info(`new connection on ${path} from ${client_ip}`);
  
  try {
    if (path.endsWith("/")) {
      let wisp_conn = new ServerConnection(ws, path, options);
      await wisp_conn.setup();
      await wisp_conn.run();
    }
  
    else {
      let wsproxy = new WSProxyConnection(ws, path, options);
      await wsproxy.setup();
    }  
  }

  catch (error) {
    ws.close();
    if (error instanceof AccessDeniedError) return;
    logging.error("Uncaught server error:\n" + error.stack);
  }
}