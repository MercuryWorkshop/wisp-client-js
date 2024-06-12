export const DEBUG = 0;
export const INFO = 1;
export const WARN = 2;
export const ERROR = 3;
export const NONE = 4;
export let log_level = INFO;

export function get_timestamp() {
  let [date, time] = new Date().toJSON().split("T");
  date = date.replaceAll("-", "/");
  time = time.split(".")[0];
  return `[${date} - ${time}]`;
}

export function set_level(level) {
  log_level = level;
}

export function debug(...messages) {
  if (log_level > DEBUG) return;
  console.debug(get_timestamp() + " debug:", ...messages);
}

export function info(...messages) {
  if (log_level > INFO) return;
  console.info(get_timestamp() + " info:", ...messages);
}

export function log(...messages) {
  if (log_level > INFO) return;
  console.log(get_timestamp() + " log:", ...messages);
}

export function warn(...messages) {
  if (log_level > WARN) return;
  console.warn(get_timestamp() + " warn:", ...messages);
}

export function error(...messages) {
  if (log_level > ERROR) return;
  console.error(get_timestamp() + " error:", ...messages);
}

