import * as logging from "../logging.mjs";
import { AsyncQueue } from "../websocket.mjs";
import { options } from "./options.mjs";
import { net, dgram, dns } from "../compat.mjs";

//wrappers for node networking apis
//in the browser these can be redefined to allow for custom transports

export const is_node = (typeof process !== "undefined");

const dns_cache = new Map();

export function assert_on_node() {
  if (!is_node) {
    throw "not running on node.js";
  }
}

export async function lookup_ip(hostname) {
  if (!is_node) { //we cannot do the dns lookup on the browser
    return hostname;
  }

  let ip_level = net.isIP(hostname);
  if (ip_level === 4 || ip_level === 6) {
    return hostname; //hostname is already an ip address
  }

  //remove stale entries from the cache
  let now = Date.now();
  for (let [entry_hostname, cache_entry] of dns_cache) {
    let ttl = now - cache_entry.time;
    if (ttl > options.dns_ttl) {
      dns_cache.delete(entry_hostname);
    }
  }

  //look in the cache first before using the system resolver
  let cache_entry = dns_cache.get(hostname);
  if (cache_entry) {
    if (cache_entry.error) 
      throw cache_entry.error
    return cache_entry.address;
  }

  //try to perform the actual dns lookup and store the result
  let address;
  try {
    address = (await dns.lookup(hostname)).address;
    dns_cache.set(hostname, {time: Date.now(), address: address});
  }
  catch (e) {
    dns_cache.set(hostname, {time: Date.now(), error: e});
    throw e;
  }

  return address;
}

export class NodeTCPSocket {
  constructor(hostname, port) {
    assert_on_node();
    this.hostname = hostname;
    this.port = port;
    this.recv_buffer_size = 128;

    this.socket = null;
    this.paused = false;
    this.connected = false;
    this.data_queue = new AsyncQueue(this.recv_buffer_size);
  }

  async connect() {
    let ip = await lookup_ip(this.hostname);
    await new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      this.socket.setNoDelay(true);
      this.socket.on("connect", () => {
        this.connected = true;
        resolve();
      });
      this.socket.on("data", (data) => {
        this.data_queue.put(data);
      });
      this.socket.on("close", (error) => {
        if (error && !this.connected) reject();
        else this.data_queue.close();
        this.socket = null;
      });
      this.socket.on("error", (error) => {
        logging.warn(`tcp stream to ${this.hostname} ended with error - ${error}`);
      });
      this.socket.on("end", () => {
        if (!this.socket) return;
        this.socket.destroy();
        this.socket = null;
      });
      this.socket.connect({
        host: ip,
        port: this.port
      });
    });
  }

  async recv() {
    return await this.data_queue.get();
  }

  async send(data) {
    await new Promise((resolve) => {
      this.socket.write(data, resolve);
    });
  }

  async close() {
    if (!this.socket) return;
    this.socket.end();
    this.socket = null;
  }

  pause() {
    if (this.data_queue.size >= this.data_queue.max_size) {
      this.socket.pause();
      this.paused = true;
    }
  }
  resume() {
    if (!this.socket) return;
    if (this.paused) {
      this.socket.resume();
      this.paused = false;
    }
  }
}

export class NodeUDPSocket {
  constructor(hostname, port) {
    assert_on_node();
    this.hostname = hostname;
    this.port = port;

    this.connected = false;
    this.recv_buffer_size = 128;
    this.data_queue = new AsyncQueue(this.recv_buffer_size);
  }

  async connect() {
    let ip = await lookup_ip(this.hostname);
    let ip_level = net.isIP(ip);
    await new Promise((resolve, reject) => {
      this.socket = dgram.createSocket(ip_level === 6 ? "udp6" : "udp4");
      this.socket.on("connect", () => {
        resolve();
      });
      this.socket.on("message", (data) => {
        this.data_queue.put(data);
      });
      this.socket.on("error", () => {
        if (!this.connected) reject();
        this.data_queue.close();
        this.socket = null;
      });
      this.socket.connect(this.port, ip);
    });
  }

  async recv() {
    return await this.data_queue.get();
  }

  async send(data) {
    this.socket.send(data);
  }

  async close() {
    if (!this.socket) return;
    this.socket.close();
    this.socket = null;
  }

  pause() {}
  resume() {}
}