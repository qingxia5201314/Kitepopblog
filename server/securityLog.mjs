export function writeSecurityEvent(event, sink = console.info) {
  const timestamp = event.timestamp === undefined ? new Date().toISOString() : String(event.timestamp);
  const output = {
    timestamp,
    type: String(event.type),
    result: String(event.result),
    userId: String(event.userId),
    username: String(event.username).trim().toLowerCase(),
    ip: String(event.ip)
  };

  sink(JSON.stringify(output));
}
