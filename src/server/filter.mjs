import { close_reasons, stream_types } from "../packet.mjs";
import { options } from "./options.mjs";

export class AccessDeniedError extends Error {}

//helper functions for the whitelist/blacklist logic
function check_port_range(entry, port) {
  return (entry === port) || (entry[0] <= port && entry[1] >= port)
}
function check_whitelist(entries, filter) {
  let matched = false;
  for (let entry of entries) {
    if (filter(entry)) {
      matched = true;
      break
    }
  }
  return !matched;
}
function check_blacklist(entries, filter) {
  for (let entry of entries) {
    if (filter(entry))
      return true;
    }
  return false;
}

//returns the close reason if the connection should be blocked
export function is_stream_allowed(connection, type, hostname, port) {
  //check if tcp or udp should be blocked
  if (!options.allow_tcp_streams && type === stream_types.TCP)
    return close_reasons.HostBlocked;
  if (!options.allow_udp_streams && type === stream_types.UDP)
    return close_reasons.HostBlocked;

  //check the hostname whitelist/blacklist
  if (options.hostname_whitelist) {
    if (check_whitelist(options.hostname_whitelist, (entry) => entry.test(hostname)))
      return close_reasons.HostBlocked;
  }
  else if (options.hostname_blacklist) {
    if (check_blacklist(options.hostname_blacklist, (entry) => entry.test(hostname)))
      return close_reasons.HostBlocked;
  }

  //check if the port is blocked
  if (options.port_whitelist) {
    if (check_whitelist(options.port_whitelist, (entry) => check_port_range(entry, port))) 
      return close_reasons.HostBlocked;
  }
  else if (options.port_blacklist) {
    if (check_blacklist(options.port_blacklist, (entry) => check_port_range(entry, port)))
      return close_reasons.HostBlocked;
  }

  //don't check stream counts if there isn't an associated wisp connection (with wsproxy for example)
  if (!connection) 
    return 0;

  //check for stream count limits
  if (options.stream_limit_total !== -1 && Object.keys(connection.streams).length >= options.stream_limit_total) 
    return close_reasons.ConnThrottled;
  if (options.stream_limit_per_host !== -1) {
    let streams_per_host = 0;
    for (let stream of connection.streams) {
      if (stream.socket.hostname === hostname) {
        streams_per_host++;
      }
    }
    if (streams_per_host >= options.stream_limit_per_host)
      return close_reasons.ConnThrottled;
  }

  return 0;
}