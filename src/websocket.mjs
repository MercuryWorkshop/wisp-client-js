//async websocket wrapper for both node and the browser

export const RealCloseEvent = (globalThis.CloseEvent || Event);

export let RealWS = globalThis.WebSocket;
if (typeof process !== "undefined") {
  let ws = await import("ws");
  RealWS = ws.WebSocket;
}

export class AsyncWebSocket {
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
}