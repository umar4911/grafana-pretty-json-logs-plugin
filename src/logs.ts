export const levels = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "unknown",
] as const;
export type Level = (typeof levels)[number];
export type Labels = Record<string, string>;
export interface LogEntry {
  id: string;
  timestamp: number;
  level: Level;
  service: string;
  container: string;
  message: string;
  fields: Record<string, unknown>;
  labels: Labels;
  raw: string;
}
const numericLevels: Record<string, Level> = {
  "10": "trace",
  "20": "debug",
  "30": "info",
  "40": "warn",
  "50": "error",
  "60": "fatal",
};
export function normalizeLevel(value: unknown): Level {
  const text = String(value ?? "").toLowerCase();
  if (Object.prototype.hasOwnProperty.call(numericLevels, text)) {
    return numericLevels[text];
  }
  if (text === "warning") {
    return "warn";
  }
  return levels.includes(text as Level) ? (text as Level) : "unknown";
}
function scalar(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined;
}
export function parseLog(
  raw: string,
  timestamp: number,
  labels: Labels = {},
  id = "",
): LogEntry {
  let fields: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      fields = parsed as Record<string, unknown>;
    }
  } catch {
    /* Plain-text and malformed lines remain readable. */
  }
  const service =
    labels.service_name ||
    labels.service ||
    labels.app ||
    scalar(fields.service) ||
    scalar(fields.name) ||
    "unknown";
  return {
    id,
    timestamp,
    raw,
    fields,
    labels,
    service,
    level: normalizeLevel(
      fields.level ?? labels.level ?? labels.detected_level,
    ),
    container:
      labels.container ||
      labels.container_name ||
      labels.docker_container_name ||
      scalar(fields.container) ||
      scalar(fields.container_name) ||
      scalar(fields.hostname) ||
      "unknown",
    message: scalar(fields.msg) ?? scalar(fields.message) ?? raw,
  };
}
export function getField(log: LogEntry, key: string): unknown {
  if (key === "level" || key === "severity") {
    return log.level;
  }
  if (key === "container") {
    return log.container;
  }
  if (key === "service") {
    return log.service;
  }
  if (Object.prototype.hasOwnProperty.call(log.fields, key)) {
    return log.fields[key];
  }
  let value: unknown = log.fields;
  for (const part of key.split(".")) {
    if (
      !value ||
      typeof value !== "object" ||
      !Object.prototype.hasOwnProperty.call(value, part)
    ) {
      return log.labels[key];
    }
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}
// AND-separated text and exact key=value terms; quote values containing spaces.
export function matchesSearch(log: LogEntry, search: string): boolean {
  const terms = search.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  return terms.every((term) => {
    const equals = term.indexOf("=");
    if (equals > 0) {
      const key = term.slice(0, equals);
      const value = term.slice(equals + 1).replace(/^(["'])(.*)\1$/, "$2");
      const actual = getField(log, key);
      return (
        actual !== undefined &&
        (key === "level" || key === "severity"
          ? log.level === normalizeLevel(value) &&
            (normalizeLevel(value) !== "unknown" ||
              value.toLowerCase() === "unknown")
          : String(actual) === value)
      );
    }
    const needle = term.replace(/^(["'])(.*)\1$/, "$2").toLowerCase();
    return `${log.raw} ${JSON.stringify(log.labels)}`
      .toLowerCase()
      .includes(needle);
  });
}
export function histogram(
  logs: LogEntry[],
  start: number,
  end: number,
  count = 72,
): number[] {
  const bins = Array.from({ length: count }, () => 0);
  if (end <= start) {
    return bins;
  }
  for (const log of logs) {
    if (log.timestamp < start || log.timestamp > end) {
      continue;
    }
    const bucket = Math.min(
      count - 1,
      Math.floor(((log.timestamp - start) / (end - start)) * count),
    );
    bins[bucket]++;
  }
  return bins;
}
export interface LokiResponse {
  status: string;
  data?: {
    resultType: string;
    result: Array<{ stream: Labels; values: Array<[string, string]> }>;
  };
  error?: string;
}
export function decodeLoki(response: LokiResponse): LogEntry[] {
  if (
    response.status !== "success" ||
    response.data?.resultType !== "streams"
  ) {
    throw new Error(
      response.error ||
        "Enter a log query that returns log streams, not a metric query.",
    );
  }
  return response.data.result
    .flatMap((stream, streamIndex) =>
      stream.values.map(([ns, raw], index) =>
        parseLog(
          raw,
          Number(BigInt(ns) / 1000000n),
          stream.stream,
          `${streamIndex}:${index}:${ns}`,
        ),
      ),
    )
    .sort((a, b) => b.timestamp - a.timestamp);
}
