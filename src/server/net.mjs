//wrappers for node networking apis
//in the browser these can be redefined to allow for custom transports

export const is_node = (typeof process !== "undefined");

export let net = null;
export let dgram = null;
export let dns = null;

if (is_node) {
  net = await import("node:net");
  dgram = await import("node:dgram");
  dns = await import("node:dns/promises");
}

export function assert_on_node() {
  if (!is_node) {
    throw "not running on node.js";
  }
}

async function lookup_ip(hostname) {
  let ip_level = net.isIP(hostname);
  if (ip_level === 4 || ip_level === 6) {
    return hostname; //hostname is already an ip address
  }
  return await dns.lookup(hostname);
}

export class NodeTCPSocket {
  constructor(hostname, port) {
    assert_on_node();
    this.hostname = hostname;
    this.port = port;

    this.socket = null;
    this.connected = false;
    this.data_callback = () => {};
  }

  async connect() {
    let ip = await lookup_ip(this.hostname);
    await new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      this.socket.on("connect", () => {
        this.connected = true;
        resolve();
      });
      this.socket.on("data", (data) => {
        this.data_callback(data);
      });
      this.socket.on("close", (error) => {
        if (error && !this.connected) reject();
        else this.data_callback(null);
      });
      this.socket.on("end", () => {
        this.socket.destroy();
      })
      this.socket.connect({
        host: ip,
        port: this.port
      });
    });
  }

  async recv() {
    return await new Promise((resolve) => {
      this.data_callback = resolve;
    });
  }

  async send(data) {
    await new Promise((resolve) => {
      this.socket.write(data, resolve);
    });
  }

  async close() {
    this.socket.end();
  }
}

export class NodeUDPSocket {
  constructor(hostname, port) {
    assert_on_node();
    this.hostname = hostname;
    this.port = port;

    this.ip = null;
    this.connected = false;
    this.data_callback = () => {};
  }

  async connect() {
    let ip = await lookup_ip(this.hostname);
    await new Promise((resolve, reject) => {
      this.socket = dgram.createSocket(this.ip_level === 6 ? "udp6" : "udp4");
      this.socket.on("connect", () => {
        resolve();
      });
      this.socket.on("message", (data) => {
        this.onmessage(data);
      });
      this.socket.on("error", () => {
        if (!this.connected) reject();
        this.data_callback(null);
      });
      this.socket.connect({
        address: ip,
        port: this.port
      });
    });
  }

  async recv() {
    return await new Promise((resolve) => {
      this.data_callback = resolve;
    });
  }

  async send(data) {
    this.socket.send(data);
  }

  async close() {
    this.socket.end();
  }
}