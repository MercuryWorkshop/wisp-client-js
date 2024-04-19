import * as logging from "../logging.mjs";
import { AsyncWebSocket } from "../websocket.mjs";
import { NodeTCPSocket } from "./net.mjs";

export class WSProxyConnection {
  constructor(ws, path) {
    let [hostname, port] = path.split("/").pop().split(":");
    this.hostname = hostname;
    this.port = parseInt(port);
    this.socket = new NodeTCPSocket(hostname, port);
    this.ws = new AsyncWebSocket(ws);
  }

  async setup() {
    await this.socket.connect();

    //start the proxy tasks in the background
    this.tcp_to_ws().catch((error) => {
      logging.warn(`a tcp to ws task (wsproxy) encountered an error - ${error}`);
    });
    this.ws_to_tcp().catch((error) => {
      logging.warn(`a ws to tcp task (wsproxy) encountered an error - ${error}`);
    });
  }

  async tcp_to_ws() {
    while (true) {
      let data = await this.socket.recv();
      if (data == null) {
        break;
      }
      this.socket.pause();
      await this.ws.send(data);
      this.socket.resume();
    }
    this.ws.close();
  }

  async ws_to_tcp() {
    while (true) {
      let data;
      data = await this.ws.recv();
      if (data == null) {
        break; //websocket closed
      }
      await this.socket.send(data);
    }
    await this.socket.close();
  }
}