export interface AbsoluteRange {
  start: number;
  end: number;
}
export type RangeSelection =
  | { kind: "relative"; minutes: number }
  | { kind: "absolute"; range: AbsoluteRange };
export function resolveRange(
  selection: RangeSelection,
  now = Date.now(),
): AbsoluteRange {
  return selection.kind === "absolute"
    ? selection.range
    : { start: now - selection.minutes * 60000, end: now };
}
export function localDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 23);
}
export function parseCustomRange(from: string, to: string): AbsoluteRange {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error("Choose a valid start and end date/time.");
  }
  if (start >= end) {
    throw new Error("The end must be after the start.");
  }
  return { start, end };
}
export function drilldownUrl(
  base: string,
  source: string,
  range: AbsoluteRange,
): string {
  const params = new URLSearchParams({
    from: String(range.start),
    to: String(range.end),
    "var-ds": source,
  });
  return `${base}/a/grafana-lokiexplore-app/explore?${params}`;
}
