import { AsyncQueue, AsyncWebSocket } from "../websocket.mjs";
import { NodeTCPSocket, NodeUDPSocket } from "./net.mjs";
import { 
  WispBuffer,
  WispPacket,
  ContinuePayload,
  ClosePayload,
  ConnectPayload,
  DataPayload
} from "../packet.mjs";

export class WispStream {
  static buffer_size = 128;

  constructor(conn, socket) {
    this.conn = conn;
    this.socket = socket;
    this.send_buffer = new AsyncQueue(WispStream.buffer_size);
  }

  async setup() {
    await this.socket.connect();

    //start the proxy tasks in the background
    this.tcp_to_ws().catch((error) => {
      console.warn(`warning: a tcp/udp to ws task encountered an error - ${error}`);
      this.close();
    });
    this.ws_to_tcp().catch((error) => {
      console.warn(`warning: a ws to tcp/udp task encountered an error - ${error}`);
      this.close();
    });
  }

  async tcp_to_ws() {
    while (true) {
      let data = await this.socket.recv();
      if (data == null) {
        break;
      }
      this.socket.pause();
      await this.ws.send(data);
      this.socket.resume();
    }
    this.ws.close();
  }

  async ws_to_tcp() {
    while (true) {
      let data;
      try {
        data = await this.ws.recv();
      }
      catch (e) {
        console.warn(e);
        break; //websocket error - close the tcp socket
      }
      if (data == null) {
        break; //websocket graceful shutdown
      }
    }
    await this.socket.close();
  }

  async close(reason = null) {
    this.send_buffer.close();
    if (reason == null) return;

    let packet = new WispPacket({
      type: ClosePayload.type,
      stream_id: stream_id,
      payload: new ClosePayload({
        reason: reason
      })
    });
    await this.conn.ws.send(packet.serialize().bytes);
  }

  async put_data(data) {
    await this.send_buffer.push(data);
  }
}

export class WispConnection {
  constructor(ws, path, {TCPSocket=NodeTCPSocket, UDPSocket=NodeUDPSocket}) {
    this.ws = new AsyncWebSocket(ws);
    this.path = path;
    this.TCPSocket = TCPSocket;
    this.UDPSocket = UDPSocket;
    this.streams = {};
  }

  async setup() {
    let packet = new WispPacket({
      type: ContinuePayload.type,
      stream_id: 0,
      payload: new ContinuePayload({
        buffer_remaining: WispStream.buffer_size
      })
    });
    await this.ws.send(packet.serialize().bytes);  
  }

  async create_stream(stream_id, type, hostname, port) {
    let SocketImpl = type === 0x01 ? this.TCPSocket : this.UDPSocket;
    let socket = new SocketImpl(hostname, port);
    let stream = new WispStream(this, socket);
    this.streams[stream_id] = stream;

    //start connecting to the destination server in the background
    stream.setup().catch((error) => {
      console.warn(`warning: creating a stream to ${hostname}:${port} failed - ${error}`);
      this.close_stream(stream_id);
    });
  }

  async close_stream(stream_id, reason = null) {
    await self.streams[stream_id].close(reason);
    delete self.streams[stream_id];
  }

  async route_packet(buffer) {
    let packet = WispPacket.parse_all(buffer);
    let stream = this.stream[packet.stream_id];

    if (stream == null && packet.stream_id !== 0) {
      console.warn(`warning: received a ${packet_classes[packet.type].name} packet for a stream which doesn't exist`);
      return;
    }

    if (packet.type === ConnectPayload.type) {
      this.create_stream(
        stream.stream_id, 
        packet.payload.stream_type, 
        packet.payload.hostname, 
        packet.payload.port
      )
    }

    else if (packet.type === DataPayload.type) {
      this.stream.put_data(packet.payload.data.bytes);
    }

    else if (packet.type == ContinuePayload.type) {
      console.warn(`warning: client sent a CONTINUE packet`);
    }

    else if (packet.type == ClosePayload.type) {
      await this.close_stream(packet.stream_id, packet.reason);
    }
  }

  async run() {
    while (true) {
      let data;
      try {
        data = await this.ws.recv();
      }
      catch (error) {
        console.error(`error: wisp websocket connection failed unexpectedly - ${error}`);
        break; //websocket error 
      }
      if (data == null) {
        break; //websocket graceful shutdown
      }
      
      try {
        await this.route_packet(new WispBuffer(data));
      }
      catch (error) {
        console.warn(`warning: routing a packet failed - ${error}`);
      }
    }
    
    //clean up all streams when the websocket is closed
    for (let stream_id of Object.keys(this.streams)) {
      await this.close_stream(stream_id);
    }
  }
}