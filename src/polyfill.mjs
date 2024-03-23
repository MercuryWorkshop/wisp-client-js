import { WispConnection } from "./wisp.mjs";

//polyfill the DOM Websocket API so that applications using wsproxy can easily use wisp with minimal changes

export const _wisp_connections = {};

export class WispWebSocket extends EventTarget {
  constructor(url, protocols) {
    super();
    this.url = url;
    this.protocols = protocols
    this.binaryType = "blob";
    this.stream = null;
    this.event_listeners = {};
    this.connection = null;

    //legacy event handlers
    this.onopen = () => {};
    this.onerror = () => {};
    this.onmessage = () => {};
    this.onclose = () => {};

    this.CONNECTING = 0;
    this.OPEN = 1;
    this.CLOSING = 2;
    this.CLOSED = 3;
    
    //parse the wsproxy url
    let url_split = this.url.split("/");
    let wsproxy_path = url_split.pop().split(":");
    this.host = wsproxy_path[0];
    this.port = parseInt(wsproxy_path[1]);
    this.real_url = url_split.join("/") + "/";

    this.init_connection();
  }

  on_conn_close() {
    if (_wisp_connections[this.real_url]) {
      this.dispatchEvent(new Event("error"));
    }
    delete _wisp_connections[this.real_url];
  }

  init_connection() {
    //create the stream
    this.connection = _wisp_connections[this.real_url];

    if (!this.connection) {
      this.connection = new WispConnection(this.real_url);
      this.connection.addEventListener("open", () => {
        this.init_stream();
      })
      this.connection.addEventListener("close", () => {this.on_conn_close()});
      this.connection.addEventListener("error", (event) => {
        this.on_conn_close()
      });
      _wisp_connections[this.real_url] = this.connection;
    }
    else if (!this.connection.connected) {
      this.connection.addEventListener("open", () => {
        this.init_stream();
      });
    }
    else {
      this.connection = _wisp_connections[this.real_url];
      this.init_stream();
    }
  }

  init_stream() {
    this.stream = this.connection.create_stream(this.host, this.port);
    this.stream.addEventListener("message", (event) => {
      let data;
      if (this.binaryType == "blob") {
        data = new Blob(event.data);
      }
      else if (this.binaryType == "arraybuffer") {
        data = event.data.buffer;
      }
      else {
        throw "invalid binaryType string";
      }
      let msg_event = new MessageEvent("message", {data: data});
      this.onmessage(msg_event);
      this.dispatchEvent(msg_event);
    });
    this.stream.addEventListener("close", (event) => {
      let close_event = new (globalThis.CloseEvent || Event)("close", {code: event.code}); 
      this.onclose(close_event);
      this.dispatchEvent(close_event);
    })
    let open_event = new Event("open");
    this.onopen(open_event);
    this.dispatchEvent(open_event);
  }

  send(data) {
    let data_array;
    if (typeof data === "string") {
      data_array = new TextEncoder().encode(data);
    }
    else if (data instanceof Blob) {
      data.arrayBuffer().then(array_buffer => {
        data_array = new Uint8Array(array_buffer);
        this.send(data_array);
      });
      return;
    }
    //any typedarray
    else if (data instanceof ArrayBuffer) {
      //dataview objects
      if (ArrayBuffer.isView(data) && data instanceof DataView) {
        data_array = new Uint8Array(data.buffer);
      }
      //regular arraybuffers
      else {
        data_array = new Uint8Array(data);
      }
    }
    //regular typed arrays
    else if (ArrayBuffer.isView(data)) {
      data_array = Uint8Array.from(data);
    }
    else {
      throw "invalid data type";
    }
    
    if (!this.stream) {
      throw "websocket is not ready";
    }
    this.stream.send(data_array);
  }

  close() {
    this.stream.close(0x02);
  }

  get bufferedAmount() {
    let total = 0;
    for (let msg of this.stream.send_buffer) {
      total += msg.length;
    }
    return total;
  }

  get extensions() {
    return "";
  }

  get protocol() {
    return "binary";
  }

  get readyState() {
    if (this.connection && !this.connection.connected && !this.connection.connecting) {
      return this.CLOSED;
    }
    if (!this.connection || !this.connection.connected) {
      return this.CONNECTING;
    }
    if (this.stream.open) {
      return this.OPEN;
    }
    return this.CLOSED;
  }
}