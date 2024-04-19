//async websocket wrapper for both node and the browser

export const RealCloseEvent = (globalThis.CloseEvent || Event);

export let RealWS = globalThis.WebSocket;
if (typeof process !== "undefined") {
  let ws = await import("ws");
  RealWS = ws.WebSocket;
}

//an async websocket wrapper
export class AsyncWebSocket {
  send_buffer_size = 1024 ** 3;
  
  constructor(ws) {
    this.ws = ws;
    this.connected = false;
    this.data_queue = new AsyncQueue(1);
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.onopen = () => {
        this.connected = true;
        resolve();
      }
      this.ws.onmessage = (event) => {
        this.data_queue.put(event.data);
      }
      this.ws.onclose = () => {
        if (!this.connected) reject();
        else this.data_queue.close();
      }
      if (this.ws.readyState === this.ws.OPEN) {
        resolve();
      }
    });
  }

  async recv() {
    return await this.data_queue.get();
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

//an async fifo queue
export class AsyncQueue {
  constructor(max_size) {
    this.max_size = max_size;
    this.queue = [];
    this.put_callbacks = [];
    this.get_callbacks = [];
  }

  async put(data) {
    this.queue.push(data);
    this.get_callbacks.shift()?.();
    if (this.queue.length <= this.max_size) return;

    //wait until there is a place to put the item
    await new Promise((resolve) => {
      this.put_callbacks.push(resolve);
    });
  }

  async get() {
    if (this.queue[0]) {
      this.put_callbacks.shift()?.();
      return this.queue.shift();
    }

    //wait until there is an item available in the queue
    await new Promise((resolve) => {
      this.get_callbacks.push(resolve);
    });
    let data = this.queue.shift();
    this.put_callbacks.shift()?.();
    return data;
  }

  close() {
    this.queue = [];
    let callback;
    //resolve all pending operations
    while (callback = this.get_callbacks.shift())
      callback();
    while (callback = this.put_callbacks.shift())
      callback();
  }

  get size() {
    return this.queue.size;
  }
}