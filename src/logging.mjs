export const DEBUG = 0;
export const INFO = 1;
export const WARN = 2;
export const ERROR = 3;
export const NONE = 4;
export let log_level = INFO;

export function set_level(level) {
  log_level = level;
}

export function debug(...messages) {
  if (log_level > DEBUG) return;
  console.debug("debug:", ...messages);
}

export function info(...messages) {
  if (log_level > INFO) return;
  console.info("info:", ...messages);
}

export function log(...messages) {
  if (log_level > INFO) return;
  console.log("log:", ...messages);
}

export function warn(...messages) {
  if (log_level > WARN) return;
  console.warn("warn:", ...messages);
}

export function error(...messages) {
  if (log_level > ERROR) return;
  console.error("error:", ...messages);
}

