import * as logging from "../logging.mjs";
import { AsyncQueue, AsyncWebSocket } from "../websocket.mjs";
import { NodeTCPSocket, NodeUDPSocket } from "./net.mjs";
import { 
  WispBuffer,
  WispPacket,
  ContinuePayload,
  ClosePayload,
  ConnectPayload,
  DataPayload,
  packet_classes
} from "../packet.mjs";

export class WispStream {
  static buffer_size = 128;

  constructor(stream_id, conn, socket) {
    this.stream_id = stream_id;
    this.conn = conn;
    this.socket = socket;
    this.send_buffer = new AsyncQueue(WispStream.buffer_size);
    this.packets_sent = 0;
  }

  async setup() {
    await this.socket.connect();

    //start the proxy tasks in the background
    this.tcp_to_ws().catch((error) => {
      logging.warn(`a tcp/udp to ws task encountered an error - ${error}`);
      this.close();
    });
    this.ws_to_tcp().catch((error) => {
      logging.warn(`a ws to tcp/udp task encountered an error - ${error}`);
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

      let packet = new WispPacket({
        type: DataPayload.type,
        stream_id: this.stream_id,
        payload: new DataPayload({
          data: new WispBuffer(new Uint8Array(data))
        })
      });
      this.conn.ws.send(packet.serialize().bytes);
      this.socket.resume();
    }
    await this.close(0x02);
  }

  async ws_to_tcp() {
    while (true) {
      let data = await this.send_buffer.get();
      if (data == null) {
        break; //stream closed
      }
      await this.socket.send(data);

      this.packets_sent++;
      if (this.packets_sent % (WispStream.buffer_size / 2) !== 0) {
        continue;
      }
      let packet = new WispPacket({
        type: ContinuePayload.type,
        stream_id: stream_id,
        payload: new ContinuePayload({
          buffer_remaining: WispStream.buffer_size - this.send_buffer.size
        })
      });
      this.conn.ws.send(packet.serialize().bytes);
    }
    await this.close();
  }

  async close(reason = null) {
    this.send_buffer.close();
    this.socket.close();
    if (reason == null) return;

    let packet = new WispPacket({
      type: ClosePayload.type,
      stream_id: this.stream_id,
      payload: new ClosePayload({
        reason: reason
      })
    });
    await this.conn.ws.send(packet.serialize().bytes);
  }

  async put_data(data) {
    await this.send_buffer.put(data);
  }
}

export class WispConnection {
  constructor(ws, path, {TCPSocket, UDPSocket} = {}) {
    this.ws = new AsyncWebSocket(ws);
    this.path = path;
    this.TCPSocket = TCPSocket || NodeTCPSocket;
    this.UDPSocket = UDPSocket || NodeUDPSocket;
    this.streams = {};
  }

  async setup() {
    await this.ws.connect();
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
    let stream = new WispStream(stream_id, this, socket);
    this.streams[stream_id] = stream;

    //start connecting to the destination server in the background
    stream.setup().catch((error) => {
      logging.warn(`creating a stream to ${hostname}:${port} failed - ${error}`);
      this.close_stream(stream_id, 0x03);
    });
  }

  async close_stream(stream_id, reason = null) {
    await this.streams[stream_id].close(reason);
    delete this.streams[stream_id];
  }

  async route_packet(buffer) {
    let packet = WispPacket.parse_all(buffer);
    let stream = this.streams[packet.stream_id];

    if (stream == null && packet.type == DataPayload.type) {
      logging.warn(`received a ${packet_classes[packet.stream_id].name} packet for a stream which doesn't exist`);
      return;
    }

    if (packet.type === ConnectPayload.type) {
      logging.info(`opening new stream to ${packet.payload.hostname}:${packet.payload.port}`);
      await this.create_stream(
        packet.stream_id, 
        packet.payload.stream_type, 
        packet.payload.hostname, 
        packet.payload.port
      )
    }

    else if (packet.type === DataPayload.type) {
      stream.put_data(packet.payload.data.bytes);
    }

    else if (packet.type == ContinuePayload.type) {
      logging.warn(`client sent a CONTINUE packet`);
    }

    else if (packet.type == ClosePayload.type) {
      await this.close_stream(packet.stream_id, packet.reason);
    }
  }

  async run() {
    while (true) {
      let data;
      data = await this.ws.recv();
      if (data == null) {
        break; //websocket closed
      }
      
      try {
        this.route_packet(new WispBuffer(new Uint8Array(data)));
      }
      catch (error) {
        logging.warn(`routing a packet failed - ${error}`);
      }
    }
    
    //clean up all streams when the websocket is closed
    for (let stream_id of Object.keys(this.streams)) {
      await this.close_stream(stream_id);
    }
  }
}