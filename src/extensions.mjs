import { WispBuffer } from "./packet.mjs";

class EmptyPayload {
  constructor() {}
  static parse() {
    return new EmptyPayload();
  }
  serialize() {
    return new WispBuffer(0);
  }
}


export class UDPExtension {
  static id = 0x01;
  static name = "UDP";

  static Server = EmptyPayload;
  static Client = EmptyPayload;
}

export class PasswordAuthExtension {
  static id = 0x02;
  static name = "Password Authentication";

  static Server = class {
    constructor({required}) {
      this.required = required ? 1 : 0;
    }
    static parse(buffer) {
      return new PasswordAuthExtension.Server({
        required: buffer.view.getUint8(0)
      });
    }
    serialize() {
      let buffer = new WispBuffer(1);
      buffer.view.setUint8(0, this.required);
      return buffer;
    }
  }

  static Client = class {
    constructor(username, password) {
      this.username = username;
      this.password = password;
    }
    static parse(buffer) {
      let username_len = buffer.view.getUint8(0);
      let password_len = buffer.view.getUint16(1);
      let password_index = username_len + 3;
      return new PasswordAuthExtension.Client({
        username: buffer.slice(3, username_len).get_string(),
        password: buffer.slice(password_index, password_len).get_string()
      });
    }
    serialize() {
      let username_buffer = new WispBuffer(this.username);
      let password_buffer = new WispBuffer(this.password);
      let buffer = new WispBuffer(3);
      buffer.view.setUint8(0, username_buffer.size);
      buffer.view.setUint16(1, password_buffer.size);
      return buffer.concat(username_buffer).concat(password_buffer);
    }
  }
}

export class MOTDExtension {
  static id = 0x04;
  static name = "Server MOTD";

  static Server = class {
    constructor(message) {
      this.message = message;
    }
    static parse(buffer) {
      return new MOTDExtension.Server({
        message: buffer.get_string()
      });
    }
    serialize() {
      let buffer = new WispBuffer(this.message);
      return buffer;
    }
  }

  static Client = EmptyPayload;
}