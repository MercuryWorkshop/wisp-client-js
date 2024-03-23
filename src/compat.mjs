//fix minor api differences between node and the browser

export const RealCloseEvent = (globalThis.CloseEvent || Event);

export let RealWS = globalThis.WebSocket;
if (typeof process !== "undefined") {
  let ws = await import("ws");
  RealWS = ws.WebSocket;
}