const now = Date.now();
const streams = [
  "api-gateway",
  "billing-worker",
  "auth-service",
  "webhook-service",
].map((service) => ({
  stream: {
    service_name: service,
    container: `${service}-1`,
  },
  values: Array.from({ length: 80 }, (_, i) => {
    const time = now - (80 - i) * 10000;
    const level = i % 13 === 0 ? 50 : i % 7 === 0 ? 40 : 30;
    return [
      `${time}000000`,
      JSON.stringify({
        level,
        time,
        pid: 42,
        hostname: `${service}-7c9b4`,
        service,
        msg:
          level === 50
            ? "upstream request failed"
            : level === 40
              ? "request exceeded latency threshold"
              : "request completed",
        requestId: `req-${String(i + 1).padStart(4, "0")}`,
        req: { method: "POST", url: "/v1/events" },
        responseTime: 12 + i,
        ...(level === 50
          ? {
              err: {
                type: "TimeoutError",
                message: "Request timed out",
                stack:
                  "TimeoutError: Request timed out\n    at Client.request (src/client.ts:84:13)",
              },
            }
          : {}),
      }),
    ];
  }),
}));
const response = await fetch("http://localhost:3100/loki/api/v1/push", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ streams }),
});
if (!response.ok) {
  throw new Error(
    `Loki rejected sample logs (${response.status}): ${await response.text()}`,
  );
}
console.log("Added 320 synthetic Pino log entries to local Loki.");
