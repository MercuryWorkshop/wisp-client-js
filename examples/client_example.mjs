//replace with "@mercuryworkshop/wisp-js/client"
import { client } from "../src/entrypoints/client.mjs";
const { ClientConnection, WispWebSocket, _wisp_connections } = client;

let ws_url = `ws://localhost:5001/ws/`;
if (typeof process === "undefined") {
  ws_url = location.href.replace("http", "ws");
}

function run_demo() {
  let ws = new WispWebSocket(ws_url+"alicesworld.tech:80");
  ws.binaryType = "arraybuffer";
  ws.addEventListener("open", () => {
    let payload = "GET / HTTP/1.1\r\nHost: alicesworld.tech\r\nConnection: keepalive\r\n\r\n";
    ws.send(payload);
  });
  ws.addEventListener("message", (event) => {
    let text = new TextDecoder().decode(event.data);
    console.log("message from stream 1: ", text);
  });
  ws.addEventListener("close", () => {
    console.log("stream 1 closed");
  });

  let ws2 = new WispWebSocket(ws_url+"www.google.com:80");
  ws2.binaryType = "arraybuffer";
  ws2.addEventListener("open", () => {
    let payload = "GET / HTTP/1.1\r\nHost: www.google.com\r\nConnection: close\r\n\r\n";
    ws2.send(payload);
  });
  ws2.addEventListener("message", (event) => {
    let text = new TextDecoder().decode(event.data);
    console.log("message from stream 2: ", text);
  });
  ws2.addEventListener("close", () => {
    console.log("stream 2 closed");
  });

  let conn = new ClientConnection(ws_url);
  conn.onopen = () => {
    let stream = conn.create_stream("127.0.0.1", 5553, "udp");
    stream.onmessage = (data) => {
      console.log("message from stream 3: ", new TextDecoder().decode(data));
    }
    stream.send(new TextEncoder().encode("hello"));
  }
  conn.onclose = () => {
    console.log("stream 3 closed");
  }
}

globalThis.ClientConnection = ClientConnection;
globalThis.WispWebSocket = WispWebSocket;
globalThis.ws_url = ws_url;
globalThis.run_demo = run_demo;
globalThis._wisp_connections = _wisp_connections;

run_demo();
