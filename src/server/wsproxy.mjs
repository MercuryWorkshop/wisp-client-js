import * as logging from "../logging.mjs";
import * as filter from "./filter.mjs";
import { stream_types } from "../packet.mjs";
import { AsyncWebSocket } from "../websocket.mjs";
import { NodeTCPSocket } from "./net.mjs";

export class WSProxyConnection {
  constructor(ws, path) {
    let [hostname, port] = path.split("/").pop().split(":");
    this.hostname = hostname;
    this.port = parseInt(port);

    let err_code = filter.is_stream_allowed(null, stream_types.TCP, this.hostname, this.port);
    if (err_code !== 0) {
      logging.info(`Refusing to create a wsproxy connection to ${this.hostname}:${this.port}`);
      throw new filter.AccessDeniedError();
    }

    this.socket = new NodeTCPSocket(hostname, port);
    this.ws = new AsyncWebSocket(ws);
  }

  async setup() {
    await this.ws.connect();
    await this.socket.connect();

    //start the proxy tasks in the background
    this.tcp_to_ws().catch((error) => {
      logging.error(`a tcp to ws task (wsproxy) encountered an error - ${error}`);
    });
    this.ws_to_tcp().catch((error) => {
      logging.error(`a ws to tcp task (wsproxy) encountered an error - ${error}`);
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
    await this.ws.close();
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