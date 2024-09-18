//the node modules referenced by other parts of the code do not exist on the web
//some of them can be replaced by the standard browser apis, others have to be ignored

export const WebSocket = globalThis.WebSocket;
export const crypto = globalThis.crypto;
export const WebSocketServer = null;
export const net = null;
export const dgram = null;
export const dns = null;
export const http = null;