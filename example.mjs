import {WispConnection} from "./src/wisp.mjs";
import {WispWebSocket, _wisp_connections} from "./src/polyfill.mjs";

let ws_url = `ws://localhost:5001/ws/`;
if (typeof process === "undefined") {
  ws_url = location.href.replace("http", "ws");
}

function run_demo() {
  let ws = new WispWebSocket(ws_url+"alicesworld.tech:80");
  ws.binaryType = "arraybuffer";
  ws.addEventListener("open", () => {
    let payload = "GET / HTTP/1.1\r\nHost: alicesworld.tech\r\nConnection: close\r\n\r\n";
    ws.send(payload);
  });
  ws.addEventListener("message", (event) => {
    let text = new TextDecoder().decode(event.data);
    console.log("message from stream 1: ", text.slice(0, 128));
  });
  ws.addEventListener("close", () => {
    console.log("stream 1 closed");
    if (typeof process !== "undefined" && ws.readyState === ws.CLOSED && ws2.readyState === ws2.CLOSED) {
      process.exit();
    }
  });

  let ws2 = new WispWebSocket(ws_url+"www.google.com:80");
  ws2.binaryType = "arraybuffer";
  ws2.addEventListener("open", () => {
    let payload = "GET / HTTP/1.1\r\nHost: www.google.com\r\nConnection: close\r\n\r\n";
    ws2.send(payload);
  });
  ws2.addEventListener("message", (event) => {
    let text = new TextDecoder().decode(event.data);
    console.log("message from stream 2: ", text.slice(0, 128));
  });
  ws2.addEventListener("close", () => {
    console.log("stream 2 closed");
    if (typeof process !== "undefined" && ws.readyState === ws.CLOSED && ws2.readyState === ws2.CLOSED) {
      process.exit();
    }
  });
}

globalThis.WispConnection = WispConnection;
globalThis.WispWebSocket = WispWebSocket;
globalThis.ws_url = ws_url;
globalThis.run_demo = run_demo;

run_demo();
