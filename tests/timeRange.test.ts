import { describe, expect, it } from "vitest";
import {
  drilldownUrl,
  localDateTime,
  parseCustomRange,
  resolveRange,
} from "../src/timeRange";
import { parseLog, matchesSearch } from "../src/logs";
describe("time ranges", () => {
  it("moves relative ranges but preserves absolute ranges on refresh", () => {
    expect(resolveRange({ kind: "relative", minutes: 15 }, 1000000)).toEqual({
      start: 100000,
      end: 1000000,
    });
    const range = { start: 100, end: 500 };
    expect(resolveRange({ kind: "absolute", range }, 9000000)).toEqual(range);
  });
  it("preserves local date/time and millisecond precision", () => {
    const start = new Date(2026, 8, 12, 9, 12, 43, 123).getTime();
    expect(
      parseCustomRange(localDateTime(start), localDateTime(start + 1)),
    ).toEqual({ start, end: start + 1 });
  });
  it("rejects missing, equal and reversed dates", () => {
    expect(() => parseCustomRange("", "")).toThrow("valid");
    expect(() =>
      parseCustomRange("2026-09-12T10:00", "2026-09-12T10:00"),
    ).toThrow("after");
    expect(() =>
      parseCustomRange("2026-09-13T10:00", "2026-09-12T10:00"),
    ).toThrow("after");
  });
  it("encodes datasource and range under a Grafana subpath for Drilldown", () => {
    const url = new URL(
      drilldownUrl("/grafana", "loki+one", { start: 1, end: 99 }),
      "https://example.com",
    );
    expect(url.pathname).toBe("/grafana/a/grafana-lokiexplore-app/explore");
    expect(url.searchParams.get("var-ds")).toBe("loki+one");
    expect(url.searchParams.get("from")).toBe("1");
    expect(url.searchParams.get("to")).toBe("99");
  });
});
describe("container identity", () => {
  it("prefers container labels and supports collector aliases and Pino hostname", () => {
    expect(
      parseLog('{"hostname":"host"}', 0, { container: "api-1" }).container,
    ).toBe("api-1");
    expect(parseLog("{}", 0, { container_name: "worker-1" }).container).toBe(
      "worker-1",
    );
    expect(
      parseLog("{}", 0, { docker_container_name: "web-1" }).container,
    ).toBe("web-1");
    const log = parseLog('{"hostname":"host"}', 0);
    expect(log.container).toBe("host");
    expect(matchesSearch(log, "container=host")).toBe(true);
  });
});
