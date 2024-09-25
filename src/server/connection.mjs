import * as logging from "../logging.mjs";
import * as filter from "./filter.mjs";
import { AsyncQueue, AsyncWebSocket, get_conn_id } from "../websocket.mjs";
import { NodeTCPSocket, NodeUDPSocket } from "./net.mjs";
import { 
  WispBuffer,
  WispPacket,
  ContinuePayload,
  ClosePayload,
  ConnectPayload,
  DataPayload,
  stream_types,
  close_reasons
} from "../packet.mjs";

export class ServerStream {
  static buffer_size = 128;

  constructor(stream_id, conn, socket) {
    this.stream_id = stream_id;
    this.conn = conn;
    this.socket = socket;    
    this.send_buffer = new AsyncQueue(ServerStream.buffer_size);
    this.packets_sent = 0;
  }

  async setup() {
    await this.socket.connect();

    //start the proxy tasks in the background
    this.tcp_to_ws().catch((error) => {
      logging.error(`(${this.conn.conn_id}) a tcp/udp to ws task encountered an error - ${error}`);
      this.close();
    });
    this.ws_to_tcp().catch((error) => {
      logging.error(`(${this.conn.conn_id}) a ws to tcp/udp task encountered an error - ${error}`);
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
      await this.conn.ws.send(packet.serialize().bytes);
      this.socket.resume();
    }
    await this.conn.close_stream(this.stream_id, close_reasons.Voluntary);
  }

  async ws_to_tcp() {
    while (true) {
      let data = await this.send_buffer.get();
      if (data == null) {
        break; //stream closed
      }
      await this.socket.send(data);

      this.packets_sent++;
      if (this.packets_sent % (ServerStream.buffer_size / 2) !== 0) {
        continue;
      }
      let packet = new WispPacket({
        type: ContinuePayload.type,
        stream_id: this.stream_id,
        payload: new ContinuePayload({
          buffer_remaining: ServerStream.buffer_size - this.send_buffer.size
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

export class ServerConnection {
  constructor(ws, path, {TCPSocket, UDPSocket, ping_interval} = {}) {
    this.ws = new AsyncWebSocket(ws);
    this.path = path;
    this.TCPSocket = TCPSocket || NodeTCPSocket;
    this.UDPSocket = UDPSocket || NodeUDPSocket;
    this.ping_interval = ping_interval || 30;
    
    this.ping_task = null;
    this.streams = {};
    this.conn_id = get_conn_id();
  }

  async setup() {
    logging.info(`setting up new wisp connection with id ${this.conn_id}`);

    await this.ws.connect();
    let packet = new WispPacket({
      type: ContinuePayload.type,
      stream_id: 0,
      payload: new ContinuePayload({
        buffer_remaining: ServerStream.buffer_size
      })
    });
    await this.ws.send(packet.serialize().bytes);

    if (typeof this.ws.ws.ping !== "function") {
      return;  
    }
    this.ping_task = setInterval(() => {
      logging.debug(`(${this.conn_id}) sending websocket ping`);
      this.ws.ws.ping();
    }, this.ping_interval * 1000);
  }

  create_stream(stream_id, type, hostname, port) {
    let SocketImpl = type === stream_types.TCP ? this.TCPSocket : this.UDPSocket;
    let socket = new SocketImpl(hostname, port);
    let stream = new ServerStream(stream_id, this, socket);
    this.streams[stream_id] = stream;

    //start connecting to the destination server in the background
    (async () => {
      let close_reason = await filter.is_stream_allowed(this, type, hostname, port);
      if (close_reason) {
        logging.warn(`(${this.conn_id}) refusing to create a stream to ${hostname}:${port}`);
        await this.close_stream(stream_id, close_reason, true);
        return;
      }
      try {
        await stream.setup();
      }
      catch (error) {
        logging.warn(`(${this.conn_id}) creating a stream to ${hostname}:${port} failed - ${error}`);
        await this.close_stream(stream_id, close_reasons.NetworkError);
      }
    })();
  }

  async close_stream(stream_id, reason = null, quiet = false) {
    let stream = this.streams[stream_id];
    if (stream == null) {
      return;
    }
    if (reason && !quiet) {
      logging.info(`(${this.conn_id}) closing stream to ${stream.socket.hostname} for reason ${reason}`);
    }
    await stream.close(reason);
    delete this.streams[stream_id];
  }

  route_packet(buffer) {
    let packet = WispPacket.parse_all(buffer);
    let stream = this.streams[packet.stream_id];

    if (stream == null && packet.type == DataPayload.type) {
      logging.warn(`(${this.conn_id}) received a DATA packet for a stream which doesn't exist`);
      return;
    }

    if (packet.type === ConnectPayload.type) {
      let type_info = packet.payload.stream_type === stream_types.TCP ? "TCP" : "UDP";
      logging.info(`(${this.conn_id}) opening new ${type_info} stream to ${packet.payload.hostname}:${packet.payload.port}`);
      this.create_stream(
        packet.stream_id, 
        packet.payload.stream_type, 
        packet.payload.hostname.trim(), 
        packet.payload.port
      )
    }

    else if (packet.type === DataPayload.type) {
      stream.put_data(packet.payload.data.bytes);
    }

    else if (packet.type == ContinuePayload.type) {
      logging.warn(`(${this.conn_id}) client sent a CONTINUE packet, this should never be possible`);
    }

    else if (packet.type == ClosePayload.type) {
      this.close_stream(packet.stream_id, packet.reason);
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
        logging.warn(`(${this.conn_id}) routing a packet failed - ${error}`);
      }
    }
    
    //clean up all streams when the websocket is closed
    for (let stream_id of Object.keys(this.streams)) {
      await this.close_stream(stream_id);
    }
    clearInterval(this.ping_task);
    logging.info(`(${this.conn_id}) wisp connection closed`);
  }
}