import {
  WispBuffer,
  extension_types,
 encode_text 
} from "./packet.mjs"


export class Extension {
  constructor({
    ext_id,
    buffer
  }) {
    this.ext_id = ext_id;
    this.buffer = buffer;
  }
}

export class ExtensionWrapper {
  constructor(ext_id, isServer, data) {
    this.ext_id =ext_id;
    this.isServer = isServer;
    this.data = data;
  }
  static generateOnServer() {
    console.error("Extension is not meant for the server")
  }
  static generateOnClient() {
    console.error("Extension is not meant for the server")
  }

  createExtension(buffer) {
    return new Extension({
      ext_id: this.ext_id,
      buffer: buffer
    });
  }
}
export class UDPExtension extends ExtensionWrapper {
  constructor(isServer) {
    super(extension_types.UDP, isServer, {})
  }
  static generateOnServer() {
    return new UDPExtension(true);
  }
  static generateOnClient() {
    return new UDPExtension(false);
  }
  serialize() {
    return super.createExtension(new WispBuffer(0));
  }
}
export class PasswordAuthExtension extends ExtensionWrapper {
  constructor(isServer, username, password) {
    super(extension_types.PASSWORD_AUTH, isServer, {
      password: password,
      username: username
    })
  }
  static generateOnClient(username, password) {
    return new PasswordAuthExtension(false, username, password);
  }
  static generateOnServer() {
    return new PasswordAuthExtension(true)
  }

  serialize() {
    if(this.isServer){
      return super.serialize(new WispBuffer(0));
    }
    let username_buffer = encode_text(this.data.username);
    let password_buffer = encode_text(this.data.password);
    // uint_8 + uint_16 + ...
    let size = 1 + 2 + username_buffer.length + password_buffer.length;
    let buffer = new WispBuffer(size);
    buffer.view.setUint8(0, username_buffer.length)
    buffer.view.setUint8(1, password_buffer.length)
    let cursor = 3;
    for (let mini_cursor = 0; mini_cursor < cursor + username_buffer.length; mini_cursor++)
      buffer.bytes[cursor + mini_cursor] = username_buffer[mini_cursor]
    cursor += username_buffer.length;
    for (let mini_cursor = 0; mini_cursor < cursor + password_buffer.length; mini_cursor++)
      buffer.bytes[cursor + mini_cursor] = password_buffer[mini_cursor]
    cursor += password_buffer.length;

    return super.createExtension(buffer);
  }
}
