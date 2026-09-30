import { describe, expect, it } from "vitest";
import {
  decodeLoki,
  histogram,
  matchesSearch,
  normalizeLevel,
  parseLog,
} from "../src/logs";

describe("Pino normalization", () => {
  it("maps standard numeric levels and handles custom/unknown values", () => {
    expect([10, 20, 30, 40, 50, 60].map(normalizeLevel)).toEqual([
      "trace",
      "debug",
      "info",
      "warn",
      "error",
      "fatal",
    ]);
    expect(normalizeLevel("ERROR")).toBe("error");
    expect(normalizeLevel("warning")).toBe("warn");
    expect(normalizeLevel(35)).toBe("unknown");
    expect(normalizeLevel("__proto__")).toBe("unknown");
    expect(normalizeLevel("constructor")).toBe("unknown");
  });
  it("preserves fields, error stacks, and raw data without trusting the embedded clock", () => {
    const raw = JSON.stringify({
      level: 50,
      time: 123,
      msg: "failed",
      service: "fallback",
      err: { stack: "a\nb" },
    });
    const log = parseLog(raw, 500, { service_name: "api" });
    expect(log).toMatchObject({
      level: "error",
      service: "api",
      timestamp: 500,
      message: "failed",
      raw,
      fields: { err: { stack: "a\nb" } },
    });
  });
  it.each(["not json", "{broken", "null", "[]", '"a string"'])(
    "keeps non-object lines readable: %s",
    (raw) => {
      expect(parseLog(raw, 1)).toMatchObject({
        message: raw,
        raw,
        fields: {},
        level: "unknown",
      });
    },
  );
});
describe("loaded-log search", () => {
  const log = parseLog(
    '{"level":50,"msg":"upstream failed","requestId":"Req-A","req":{"method":"POST"},"a.b":"literal"}',
    100,
    { namespace: "payments" },
  );
  it("combines exact fields, numeric or named severity, and text", () => {
    expect(
      matchesSearch(log, "level=ERROR requestId=Req-A req.method=POST failed"),
    ).toBe(true);
    expect(matchesSearch(log, "level=50 namespace=payments a.b=literal")).toBe(
      true,
    );
    expect(matchesSearch(log, "requestId=req-a")).toBe(false);
    expect(matchesSearch(log, "level=INFO failed")).toBe(false);
    expect(matchesSearch(log, "UPSTREAM")).toBe(true);
  });
  it("supports quoted values and rejects absent fields", () => {
    expect(matchesSearch(log, 'msg="upstream failed"')).toBe(true);
    expect(matchesSearch(log, "missing=undefined")).toBe(false);
    expect(matchesSearch(log, "__proto__.polluted=yes")).toBe(false);
    expect(matchesSearch(parseLog("raw", 0), "level=invalid")).toBe(false);
  });
});
describe("Loki and volume", () => {
  it("keeps duplicates, converts nanoseconds safely and sorts streams", () => {
    const logs = decodeLoki({
      status: "success",
      data: {
        resultType: "streams",
        result: [
          {
            stream: { app: "a" },
            values: [
              ["1720000000123456789", '{"level":30}'],
              ["1720000000123456789", '{"level":30}'],
            ],
          },
          { stream: { app: "b" }, values: [["1720000001123456789", "text"]] },
        ],
      },
    });
    expect(logs.map((l) => l.timestamp)).toEqual([
      1720000001123, 1720000000123, 1720000000123,
    ]);
    expect(new Set(logs.map((l) => l.id)).size).toBe(3);
  });
  it("rejects metric queries and backend errors", () => {
    expect(() =>
      decodeLoki({
        status: "success",
        data: { resultType: "matrix", result: [] },
      }),
    ).toThrow("log streams");
    expect(() => decodeLoki({ status: "error", error: "denied" })).toThrow(
      "denied",
    );
  });
  it("bins boundary timestamps and excludes out-of-range entries", () => {
    expect(
      histogram(
        [-1, 0, 49, 50, 100, 101].map((t) => parseLog("x", t)),
        0,
        100,
        2,
      ),
    ).toEqual([2, 2]);
    expect(histogram([], 100, 100, 2)).toEqual([0, 0]);
  });
});
