# JavaScript Wisp Client

This is an implementation of a [Wisp](https://github.com/mercuryWorkshop/wisp-protocol) client, written in Javascript for use in NodeJS and on the Web.

## Client API:

### Importing the Library:
To use this library on either NodeJS or the browser, import the `wisp.mjs` file. Alternatively, use the `dist/wisp.js` file in the NPM package if you don't want to use an ES6 module.

### Connecting to a Wisp Server:
You can create a new Wisp connection by creating a new `WispConnection` object. The only argument to the constructor is the URL of the Wisp websocket server. Use the `open` event to know when the Wisp connection is ready.
```js
let conn = new WispConnection("wss://example.com/wisp/");
conn.onopen = () => {
  console.log("wisp connection is ready!");
};
conn.onclose = () => {
  console.log("wisp connection closed");
};
conn.onerror = () => {
  console.log("wisp connection error");
};
```

### Creating New Streams:
Once you have your `WispConnection` object, and you have waited for the connection to be established, you can use the `WispConnection.create_stream` method to create new streams. The two arguments to this function are the hostname and port of the new stream, and a `WispStream` object will be returned. You can also pass a third argument to `create_stream`, which is the type of the stream, and it can be either `"tcp"` (the default) or `"udp"`.

For receiving incoming messages, use the `onmessage` callback on the `WispStream` object. The returned data will always be a `Uint8Array`. The `onclose` callback can be used to know when the stream is closed. 

You can use `stream.send` to send data to the stream, and it must take a `Uint8Array` as the argument. Newly created streams are available for writing immediately, so you don't have to worry about waiting to send your data.
```js
let stream = conn.create_stream("www.google.com", 80);
stream.onmessage = (data) => {
  let text = new TextDecoder().decode(data);
  console.log(text);
};
stream.onclose = (reason) => {
  console.log("stream closed for reason: " + reason);
};

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

## Server API:
### Basic Example:
This example uses the `node:http` module as a basic web server. It accepts new Wisp connections from incoming websockets.
```js
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import http from "node:http";

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("wisp server js rewrite");
});

server.on("upgrade", (req, socket, head) => {
  wisp.routeRequest(req, socket, head);
});

server.on("listening", () => {
  console.log("HTTP server listening");
});

server.listen(5001, "127.0.0.1");
```

### Example With Express:
```js
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import express from "express";
import morgan from "morgan";

const app = express();
const port = process.env.PORT || 5001;

app.use(morgan("combined"));
app.use(express.static("./"));

const server = app.listen(port, () => {
  console.log("Listening on port: ", port)
});

server.on("upgrade", (request, socket, head) => {
  wisp.routeRequest(request, socket, head);
});
```

### Change the Log Level:
By default, all info messages are shown. You can change this by importing `logging` from the module, and calling `logging.set_level` to set it to one of the following values:
- `logging.DEBUG`
- `logging.INFO` (default)
- `logging.WARN`
- `logging.ERROR`
- `logging.NONE`

```js
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";

logging.set_level(logging.DEBUG);
```

### Changing Server Settings:
To change settings globally for the Wisp server, you can use the `wisp.options` object. 

The available settings are:
- `options.hostname_blacklist` - An array of regex objects to match against the destination server. Any matches will be blocked.
- `options.hostname_whitelist` - Same as `hostname_blacklist`, but only matches will be allowed through, and setting this will supersede `hostname_blacklist`.
- `options.port_blacklist` - An array of port numbers or ranges to block on the destination server. Specific ports are expressed as a single number, and ranges consist of a two element array containing the start and end. For example `80` and `[3000, 4000]` are both valid entries in this array.
- `options.port_whitelist` - Same as `port_whitelist`, but only matches will be allowed through, and setting this will supersede `port_blacklist`.
- `options.stream_limit_per_host` - The maximum number of streams that may be open to a single hostname, per connection. Defaults to no limit.
- `options.stream_limit_total` - The total number of streams that may be open to all hosts combined, per connection. Defaults to no limit.
- `options.allow_udp_streams` - If this is `false`, UDP streams will be blocked. Defaults to `true`.
- `options.allow_tcp_streams` - If this is `false`, TCP streams will be blocked. Defaults to `true`.

For example:
```js
wisp.options.port_whitelist = [
  [5000, 6000],
  80,
  443
]
wisp.options.hostname_blacklist = [
  /google\.com/,
  /reddit\.com/,
]
```

### Migrating from wisp-server-node:
This is designed to be a drop-in replacement for [wisp-server-node](https://github.com/MercuryWorkshop/wisp-server-node). You can replace your old import with the following, and your application will still work in the same way:
```js
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
```

## Copyright:
This library is licensed under the GNU AGPL v3.

### Copyright Notice:
```
wisp-js: a Wisp client implementation written in JavaScript
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