const protocol_string = "wisp-v1"

function uint_from_array(array) {
  if (array.length == 4) return new Uint32Array(array.buffer)[0];
  else if (array.length == 2) return new Uint16Array(array.buffer)[0];
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

class WispStream {
  constructor(hostname, port, websocket, buffer_size, stream_id, connection) {
    this.hostname = hostname;
    this.port = port;
    this.ws = websocket;
    this.buffer_size = buffer_size;
    this.stream_id = stream_id;
    this.connection = connection;
    this.send_buffer = [];
  }

  send(data) {
    if (this.buffer_size > 0) {
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
  close(reason=0x01) {
    let payload = array_from_uint(reason, 1)
    let packet = create_packet(0x04, this.stream_id, payload);
    this.ws.send(packet);
    delete this.connection.active_streams[this.stream_id];
  }

  onmessage(data) {}
  onclose(reason) {}
}

class WispConnection {
  constructor(wisp_url) {
    this.wisp_url = wisp_url;
    this.max_buffer_size = null;
    this.active_streams = {};
  }

  connect_ws() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wisp_url);
      this.ws.binaryType = "arraybuffer";
      let first_message = true;
      this.ws.addEventListener("error", (event) => {
        reject(event);
      });
      this.ws.addEventListener("message", (event) => {
        this.on_ws_msg(event);
        if (first_message) {
          first_message = false;
          resolve();
        };
      });
    });
  }

  create_stream(hostname, port) {
    let stream_id = Math.random()*2**31|0;
    let stream = new WispStream(hostname, port, this.ws, this.max_buffer_size, stream_id, this);

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
    let packet_type = packet[0];
    let stream_id = uint_from_array(packet.slice(1, 5));
    let payload = packet.slice(5);
    let stream = this.active_streams[stream_id];

    if (packet_type === 0x02) { //DATA packets
      stream.onmessage(payload);
    }
 
    else if (packet_type === 0x03 && stream_id == 0) { //initial CONTINUE packet
      this.max_buffer_size = payload[0];
    }
    
    else if (packet_type === 0x03) { //other CONTINUE packets
      stream.continue_received(uint_from_array(payload));
    }

    else if (packet_type === 0x04) { //CLOSE packets
      stream.onclose(payload[0]);
      delete this.active_streams[stream];
    }
  }
}

async function main() {
  let connection = new WispConnection("wss://debug.ading.dev/ws", [protocol_string]);
  await connection.connect_ws();
  let stream = connection.create_stream("alicesworld.tech", 80);
  stream.onmessage = (data) => {
    console.log(new TextDecoder().decode(data));
  }
  let payload = "GET / HTTP/1.1\r\nHost: alicesworld.tech\r\nConnection: keepalive\r\n\r\n";
  console.log(payload);
  stream.send(new TextEncoder().encode(payload));
  window.stream = stream;
}
main();
