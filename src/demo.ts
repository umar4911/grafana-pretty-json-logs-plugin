import { parseLog, LogEntry } from "./logs";
export function demoLogs(now: number, minutes: number): LogEntry[] {
  const services = [
    "api-gateway",
    "billing-worker",
    "auth-service",
    "webhook-service",
  ];
  const messages = [
    "request completed",
    "payment processed successfully",
    "user session validated",
    "webhook delivered",
  ];
  return Array.from({ length: 180 }, (_, i) => {
    const service = services[i % services.length];
    const time = now - Math.floor((i / 180) * minutes * 60000);
    const level = i % 17 === 0 ? 50 : i % 11 === 0 ? 40 : i % 7 === 0 ? 20 : 30;
    const raw = JSON.stringify({
      level,
      time,
      pid: 42,
      hostname: `${service}-7c9b4`,
      service,
      requestId: `req-${String(Math.floor(i / 3) + 1).padStart(4, "0")}`,
      msg:
        level === 50
          ? "upstream request failed"
          : level === 40
            ? "request exceeded latency threshold"
            : messages[i % 4],
      req: { method: "POST", url: "/v1/events" },
      responseTime: 12 + (i % 240),
      ...(level === 50
        ? {
            err: {
              type: "TimeoutError",
              message: "Upstream did not respond within 5000ms",
              stack:
                "TimeoutError: Upstream did not respond within 5000ms\n    at Client.request (src/client.ts:84:13)\n    at async handleEvent (src/events.ts:32:5)",
            },
          }
        : {}),
    });
    return parseLog(
      raw,
      time,
      { container: `${service}-1`, service_name: service },
      `demo:${i}`,
    );
  });
}
