//async websocket wrapper for both node and the browser

export const RealCloseEvent = (globalThis.CloseEvent || Event);

export let RealWS = globalThis.WebSocket;
if (typeof process !== "undefined") {
  let ws = await import("ws");
  RealWS = ws.WebSocket;
}

export class AsyncWebSocket {
  send_buffer_size = 1024 ** 3;
  
  constructor(ws) {
    this.ws = ws;
    this.connected = false;
    this.data_callback = () => {};
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.onopen = () => {
        this.connected = true;
        resolve();
      }
      this.ws.onmessage = (event) => {
        this.data_callback(event.data, false);
      }
      this.ws.onclose = () => {
        if (!this.connected) reject();
        else this.data_callback(null, false);
      }
      this.ws.onerror = () => {
        if (!this.connected) reject();
        else this.data_callback(null, true);
      }
    }) 
  }

  async recv() {
    let [data, error] = await new Promise((resolve) => {
      this.data_callback = resolve;
    });
    if (error) {
      throw "unknown websocket error";
    }
    return data;
  }

  async send(data) {
    this.ws.send(data);
    if (this.ws.bufferedAmount <= this.send_buffer_size) {
      return;
    }

    //if the send buffer is too full, throttle the upload
    while (true) {
      if (this.ws.bufferedAmount <= this.send_buffer_size / 2) {
        break;
      }
      await new Promise((resolve) => {setTimeout(resolve, 10)});
    }
  }
}