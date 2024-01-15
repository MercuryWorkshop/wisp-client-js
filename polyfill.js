//polyfill the DOM Websocket API so that applications using wsproxy can easily use wisp with minimal changes

const _wisp_connections = {};

class WispWebSocket extends EventTarget {
  constructor(url, protocol) {
    super();
    this.url = url;
    this.protocol = protocol
    this.binaryType = "blob";
    this.send_buffer = [];
    this.stream == null;
    this.event_listeners = {};
    
    //parse the wsproxy url
    let url_split = this.url.split("/");
    let wsproxy_path = url_split.pop().split(":");
    this.host = wsproxy_path[0];
    this.port = parseInt(wsproxy_path[1]);
    this.real_url = url_split.join("/") + "/";

    this.init_connection();
  }

  init_connection() {
    //create the stream
    this.connection = _wisp_connections[this.real_url];

    if (!this.connection) {
      this.connection = new WispConnection(this.real_url);
      this.connection.addEventListener("open", () => {
        this.init_stream();
      })
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
      let msg_event = new MessageEvent("message", {data: event.data});
      this.dispatchEvent(msg_event);
    });
    this.stream.addEventListener("close", (event) => {
      let close_event = new CloseEvent("close", {code: event.code});
      this.dispatchEvent(close_event);
    })
    let open_event = new Event("open");
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
      if (data.isView() && data instanceof DataView) {
        data_array = new Uint8Array(data.buffer);
      }
      //regular typed arrays
      else if (data.isView()) {
        data_array = Uint8Array.from(data);
      }
      //regular arraybuffers
      else {
        data_array = new Uint8Array(buffer);
      }
    }
    else {
      throw "invalid data type to be sent";
    }
    
    if (!this.stream) {
      throw "websocket is not ready";
    }
    this.stream.send(data_array);
  }
}