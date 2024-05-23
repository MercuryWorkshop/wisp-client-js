//shared packet parsing / serialization code

const text_encoder = new TextEncoder();
const encode_text = text_encoder.encode.bind(text_encoder);
const text_decoder = new TextDecoder();
const decode_text = text_decoder.decode.bind(text_decoder);

export class WispBuffer {
  constructor(data) {
    if (data instanceof Uint8Array) {
      this.from_array(data);
    }
    else if (typeof data === "number") {
      this.from_array(new Uint8Array(data));
    }
    else if (typeof data === "string") {
      this.from_array(encode_text(data));
    }
    else {
      console.trace();
      throw "invalid data type passed to wisp buffer constructor";
    }
  }

  from_array(bytes) {
    this.size = bytes.length;
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer); 
  }

  concat(buffer) {
    let new_buffer = new WispBuffer(this.size + buffer.size);
    new_buffer.bytes.set(this.bytes, 0);
    new_buffer.bytes.set(buffer.bytes, this.size);
    return new_buffer;
  }

  slice(index, size) {
    let bytes_slice = this.bytes.slice(index, size);
    return new WispBuffer(bytes_slice);
  }
}

export class WispPacket {
  static min_size = 5;
  constructor({type, stream_id, payload, payload_bytes }) {
    this.type = type;
    this.stream_id = stream_id;
    this.payload_bytes = payload_bytes;
    this.payload = payload;
  }
  static parse(buffer) {
    return new WispPacket({
      type: buffer.view.getUint8(0),
      stream_id: buffer.view.getUint32(1, true),
      payload_bytes: buffer.slice(5)
    });
  }
  static parse_all(buffer) {
    if (buffer.size < WispPacket.min_size) {
      throw "packet too small";
    }
    let packet = WispPacket.parse(buffer);
    let payload_class = packet_classes[packet.type];
    if (typeof payload_class === "undefined") {
      throw "invalid packet type";
    }
    if (packet.payload_bytes.size < payload_class.size) {
      throw "payload too small";
    }
    packet.payload = payload_class.parse(packet.payload_bytes);
    return packet;
  }
  serialize() {
    let buffer = new WispBuffer(5);
    buffer.view.setUint8(0, this.type);
    buffer.view.setUint32(1, this.stream_id, true);
    buffer = buffer.concat(this.payload.serialize());
    return buffer;
  }
}

export class ConnectPayload {
  static min_size = 3;
  static type = 0x01;
  static name = "CONNECT";
  constructor({stream_type, port, hostname}) {
    this.stream_type = stream_type;
    this.port = port;
    this.hostname = hostname;
  }
  static parse(buffer) {
    return new ConnectPayload({
      stream_type: buffer.view.getUint8(0),
      port: buffer.view.getUint16(1, true),
      hostname: decode_text(buffer.slice(3).bytes)
    });
  }
  serialize() {
    let buffer = new WispBuffer(3);
    buffer.view.setUint8(0, this.stream_type);
    buffer.view.setUint16(1, this.port, true);
    buffer = buffer.concat(new WispBuffer(this.hostname));
    return buffer;
  }
}

export class DataPayload {
  static min_size = 0;
  static type = 0x02;
  static name = "DATA";
  constructor({data}) {
    this.data = data;
  }
  static parse(buffer) {
    return new DataPayload({
      data: buffer
    });
  }
  serialize() {
    return this.data;
  }
}

export class ContinuePayload {
  static type = 0x03;
  static name = "CONTINUE";
  constructor({buffer_remaining}) {
    this.buffer_remaining = buffer_remaining;
  }
  static parse(buffer) {
    return new ContinuePayload({
      buffer_remaining: buffer.view.getUint32(0, true),
    });
  }
  serialize() {
    let buffer = new WispBuffer(4);
    buffer.view.setUint32(0, this.buffer_remaining, true);
    return buffer;
  }
}

export class ClosePayload {
  static min_size = 1;
  static type = 0x04;
  static name = "CLOSE";
  constructor({reason}) {
    this.reason = reason;
  }
  static parse(buffer) {
    return new ClosePayload({
      reason: buffer.view.getUint8(0),
    });
  }
  serialize() {
    let buffer = new WispBuffer(1);
    buffer.view.setUint8(0, this.buffer_remaining);
    return buffer;
  }
}

class Extension {
  constructor({ ext_id, buffer }) {
    this.ext_id = ext_id;
    this.buffer = buffer;
  }
}
export class InfoPayload {
  static min_size = 2;
  static type = 0x05;
  static name = "INFO";
  constructor(
    { minor_ver, major_ver, extensions }j
  ) {
    this.minor_ver=minor_ver;
    this.major_ver= major_ver;
    this.extensions= extensions;
  }
  static parse(buffer) {
    let cursor=2;
    let extensions= [];
    while (cursor < buffer.size) {
      let ext_id= buffer.view.getUint8(cursor);
      cursor += 1;
      if (cursor > buffer.size) break;
      let payload_length= buffer.view.getUint32(cursor);
      cursor += 4;
      if (cursor + payload_length > 
        buffer.size)
        break;
      let ext_buffer= new WispBuffer(payload_length);
      for (let mini_cursor= 0; mini_cursor < payload_length; mini_cursor++) {
        ext_buffer.view[mini_cursor]= buffer.view[mini_cursor + cursor];
      }
      cursor += payload_length;
      extensions.push(new Extension({ ext_id: ext_id, buffer: ext_buffer }))
    }

    return new InfoPayload ( {
      major_ver: buffer.view.getUint8(0),
      minor_ver: 
      buffer.view.getUint8(1),
      extensions: extensions,
    });
  }
  serialize() {
    let buffer = new WispBuffer(1 + 1 +
      this.extensions.reduce((total, value) => 1 
        + 4 + value.buffer.size, 0)); // minor + major + [(id + payloadlength + payload)...]
    buffer
      .view.setUint8(0, 
      this.major_ver);
    buffer
      .view.setUint8(1, this.minor_ver);
    let cursor = 2;
    this.extensions.forEach(
      ext
      => {
      buffer.view.setUint8(cursor, ext.ext_id);
      cursor += 1;
      buffer.view.setUint32(cursor, ext.buffer.size);
      cursor += 4
      for (let mini_cursor = 0; mini_cursor < ext.buffer.size; mini_cursor++) {
        buffer.view[mini_cursor + cursor] = ext.buffer.view[mini_cursor];
      }
      cursor += ext.buffer.size;
    })
    return buffer;
  }
}


export const packet_classes = [
  undefined,
  ConnectPayload, 
  DataPayload, 
  ContinuePayload, 
  ClosePayload, 
  InfoPayload, 
]

export const packet_types = {
  CONNECT: 0x01,
  DATA: 0x02,
  CONTINUE: 0x03,
  CLOSE: 0x04,
  INFO: 0x05
}
