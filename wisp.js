//mapping of packet names to packet types
export const packet_types = {
  CONNECT: 0x01,
  DATA: 0x02,
  CONTINUE: 0x03,
  CLOSE: 0x04
}

//mapping of types to packet names
export const packet_names = [undefined, "CONNECT", "DATA", "CONTINUE", "CLOSE"];

function uint_from_array(array) {
  if (array.length == 4) return new Uint32Array(array.buffer)[0];
  else if (array.length == 2) return new Uint16Array(array.buffer)[0];
  else if (array.length == 1) return array[0];
  else throw "invalid array length";
}

function array_from_uint(int, size) {
  let buffer = new ArrayBuffer(size);
  let view = new DataView(buffer);
  if (size == 1) view.setUint8(0, int, true);
  else if (size == 2) view.setUint16(0, int, true);
  else if (size == 4) view.setUint32(0, int, true);
  else throw "invalid array length";
  return new Uint8Array(buffer);
}

function concat_uint8array() {
  let total_length = 0;
  for (let array of arguments) {
    total_length += array.length;
  }
  let new_array = new Uint8Array(total_length);
  let index = 0;
  for (let array of arguments) {
    new_array.set(array, index);
    index += array.length;
  }
  return new_array;
}

function create_packet(packet_type, stream_id, payload) {
  let stream_id_array = array_from_uint(stream_id, 4);
  let packet_type_array = array_from_uint(packet_type, 1);
  let packet = concat_uint8array(packet_type_array, stream_id_array, payload);
  return packet;
}

export class WispStream extends EventTarget {
  constructor(hostname, port, websocket, buffer_size, stream_id, connection) {
    super();
    this.hostname = hostname;
    this.port = port;
    this.ws = websocket;
    this.buffer_size = buffer_size;
    this.stream_id = stream_id;
    this.connection = connection;
    this.send_buffer = [];
    this.open = true;
  }

  send(data) {
    if (this.buffer_size > 0 || !this.open) {
      //construct and send a DATA packet
      let packet = create_packet(0x02, this.stream_id, data);
      this.ws.send(packet);
      this.buffer_size--;
    }
    else { //server is slow, don't send data yet
      this.send_buffer.push(data);
    }
  }

  //handle receiving a CONTINUE packet
  continue_received(buffer_size) {
    this.buffer_size = buffer_size;
    //send buffered data now
    while (this.buffer_size > 0 && this.send_buffer.length > 0) {
      this.send(this.send_buffer.shift());
    }
  }

  //construct and send a CLOSE packet
  close(reason = 0x01) {
    if (!this.open) return;
    let payload = array_from_uint(reason, 1)
    let packet = create_packet(0x04, this.stream_id, payload);
    this.ws.send(packet);
    this.open = false;
    delete this.connection.active_streams[this.stream_id];
  }
}

export class WispConnection extends EventTarget {
  constructor(wisp_url) {
    super();
    this.wisp_url = wisp_url;
    this.max_buffer_size = null;
    this.active_streams = {};
    this.connected = false;
    this.connecting = false;
    this.next_stream_id = 1;

    if (!this.wisp_url.endsWith("/")) {
      throw "wisp endpoints must end with a trailing forward slash";
    }

    this.connect_ws();
  }

  connect_ws() {
    this.ws = new WebSocket(this.wisp_url);
    this.ws.binaryType = "arraybuffer";
    this.connecting = true;

    this.ws.addEventListener("error", (event) => {
      this.on_ws_close();
      let error_event = new Event("error");
      this.dispatchEvent(error_event);
    });
    this.ws.addEventListener("close", () => {
      this.on_ws_close();
      let close_event = new CloseEvent("close");
      this.dispatchEvent(close_event);
    });
    this.ws.addEventListener("message", (event) => {
      this.on_ws_msg(event);
      if (this.connecting) {
        this.connected = true;
        this.connecting = false;
        let open_event = new Event("open");
        this.dispatchEvent(open_event);
      }
    });
  }

  close_stream(stream, reason) {
    let close_event = new CloseEvent("close", { code: reason });
    stream.open = false;
    stream.dispatchEvent(close_event);
    delete this.active_streams[stream.stream_id];
  }

  on_ws_close() {
    this.connected = false;
    this.connecting = false;
    for (let stream_id of Object.keys(this.active_streams)) {
      this.close_stream(this.active_streams[stream_id], 0x03);
    }
  }

  create_stream(hostname, port) {
    let stream_id = this.next_stream_id
    this.next_stream_id++;
    let stream = new WispStream(hostname, port, this.ws, this.max_buffer_size, stream_id, this);
    stream.open = this.connected;

    //construct CONNECT packet
    let type_array = array_from_uint(0x01, 1);
    let port_array = array_from_uint(port, 2);
    let host_array = new TextEncoder().encode(hostname);
    let payload = concat_uint8array(type_array, port_array, host_array);
    let packet = create_packet(0x01, stream_id, payload);

    this.active_streams[stream_id] = stream;
    this.ws.send(packet);
    return stream;
  }

  on_ws_msg(event) {
    let packet = new Uint8Array(event.data);

    if (packet.length < 5) {
      console.warn(`wisp client warning: received a packet which is too short`);
      return;
    }

    let packet_type = packet[0];
    let stream_id = uint_from_array(packet.slice(1, 5));
    let payload = packet.slice(5);
    let stream = this.active_streams[stream_id];

    if (typeof stream === "undefined" && stream_id !== 0) {
      console.warn(`wisp client warning: received a ${packet_names[packet_type]} packet for a stream which doesn't exist`);
      return;
    }

    if (packet_type === packet_types.DATA) { //DATA packets
      let msg_event = new MessageEvent("message", { data: payload });
      stream.dispatchEvent(msg_event);
    }

    else if (packet_type === packet_types.CONTINUE && stream_id == 0) { //initial CONTINUE packet
      this.max_buffer_size = uint_from_array(payload);
    }

    else if (packet_type === packet_types.CONTINUE) { //other CONTINUE packets
      stream.continue_received(uint_from_array(payload));
    }

    else if (packet_type === packet_types.CLOSE) { //CLOSE packets
      if (!stream) return;
      this.close_stream(stream, payload[0]);
    }

    else {
      console.warn(`wisp client warning: receive an invalid packet of type ${packet_type}`);
    }
  }
}

