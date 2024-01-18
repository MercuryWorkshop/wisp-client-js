# JavaScript Wisp Client

This is an implementation of a [Wisp](https://github.com/mercuryWorkshop/wisp-protocol) client, written in Javascript for use on the Web.

## Javascript API:

### Importing the Library:
To use this library, clone this repository and link to `wisp.js` via a script tag. If you want to use the WebSocket API polyfill, then you can also link the `polyfill.js` file.

### Connecting to a Wisp Server:
You can create a new Wisp connection by creating a new `WispConnection` object. The only argument to the constructor is the URL of the Wisp websocket server. Use the `open` event to know when the Wisp connection is ready.
```js
let conn = new WispConnection("wss://example.com/wisp/");
conn.addEventListener("open", () => {
  console.log("wisp connection is ready!");
});
```

### Creating New Streams:
Once you have your `WispConnection` object, and you have waited for the connection to be established, you can use the `WispConnection.create_stream` method to create new streams. The two arguments to this function are the hostname and port of the new stream, and a `WispStream` object will be returned. 

For receiving incoming messages, use the `message` event on the `WispStream` object. The returned data will always be a `Uint8Array`. The `close` and `error` events can be used to know when the stream is closed. 

You can use `stream.send` to send data to the stream, and it must take a `Uint8Array` as the argument. Newly created streams are available for writing immediately, so you don't have to worry about waiting to send your data.
```js
let stream = conn.create_stream("www.google.com", 80);
stream.addEventListener("message", (event) => {
  let text = new TextDecoder().decode(event.data);
  console.log(text);
});
stream.addEventListener("close", (event) => {
  console.log("stream closed for reason: " + event.code);
});

let payload = "GET / HTTP/1.1\r\nHost: www.google.com\r\nConnection: close\r\n\r\n";
stream.send(new TextEncoder().encode(payload));
```

### Using the WebSocket Polyfill:
The `polyfill.js` file provides an API similar to the regular [DOM WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket). Instead of creating new `WebSocket` objects, create `WispWebSocket` objects. Make sure the URL ends with the hostname and port you want to connect to. If you have code that uses the older wsproxy protocol, you can use this polyfill to provide Wisp support easily.
```js
let ws = new WispWebSocket("wss://example.com/ws/alicesworld.tech:80");
ws.binaryType = "arraybuffer";
ws.addEventListener("open", () => {
  let payload = "GET / HTTP/1.1\r\nHost: alicesworld.tech\r\nConnection: keepalive\r\n\r\n";
  ws.send(payload);
});
ws.addEventListener("message", (event) => {
  let text = new TextDecoder().decode(event.data);
  console.log("message from stream 1: ", text.slice(0, 128));
});
```

The `_wisp_connections` global object will be used to manage the active Wisp connections. This object is able to store multiple active Wisp connections, identified by the websocket URL.

## Copyright:
This library is licensed under the GNU AGPL v3.

### Copyright Notice:
```
wisp-client-js: a Wisp client implementation written in JavaScript
Copyright (C) 2024 Mercury Workshop

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
```