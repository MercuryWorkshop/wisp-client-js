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

  async connect() {
    await this.socket.connect();
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
      try {
        data = await this.ws.recv();
      }
      catch (e) {
        console.warn(e);
        break; //websocket error - close the tcp socket
      }
      if (data == null) {
        break; //websocket graceful shutdown
      }
    }
    this.socket.close();
  }
}