import React, { useEffect, useMemo, useRef, useState } from "react";
import { config, getBackendSrv, getDataSourceSrv } from "@grafana/runtime";
import {
  decodeLoki,
  getField,
  histogram,
  levels,
  LogEntry,
  LokiResponse,
  matchesSearch,
} from "./logs";
import { demoLogs } from "./demo";
import {
  RangeSelection,
  resolveRange,
  localDateTime,
  parseCustomRange,
  drilldownUrl,
} from "./timeRange";
import "./styles.css";
import { LogDrawer } from "./LogDrawer";
const LIMIT = 1000;
const LOG_BATCH_SIZE = 100;
const DEFAULT_QUERY = '{container=~".+"}';
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="pino-select">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export function App() {
  const sources = useMemo(
    () => getDataSourceSrv().getList({ type: "loki" }),
    [],
  );
  const [source, setSource] = useState(sources[0]?.uid ?? "demo");
  const [selection, setSelection] = useState<RangeSelection>({
    kind: "relative",
    minutes: 15,
  });
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(() =>
    localDateTime(Date.now() - 900000),
  );
  const [customTo, setCustomTo] = useState(() => localDateTime(Date.now()));
  const [rangeError, setRangeError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(Date.now());
  const [refresh, setRefresh] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({
    container: "",
    level: "",
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [range, setRange] = useState({
    start: Date.now() - 900000,
    end: Date.now(),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [visibleCount, setVisibleCount] = useState(LOG_BATCH_SIZE);
  const [ascending, setAscending] = useState(false);
  const request = useRef(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = ++request.current;
    const { start, end } = resolveRange(selection);
    setUpdatedAt(Date.now());
    setLoading(true);
    setError("");
    setLogs([]);
    setVisibleCount(LOG_BATCH_SIZE);
    setRange({ start, end });
    if (source === "demo") {
      setLogs(demoLogs(end, (end - start) / 60000));
      setLoading(false);
      return;
    }
    const subscription = getBackendSrv()
      .fetch<LokiResponse>({
        url: `/api/datasources/proxy/uid/${encodeURIComponent(source)}/loki/api/v1/query_range`,
        params: {
          query: DEFAULT_QUERY,
          start: `${start}000000`,
          end: `${end}000000`,
          limit: LIMIT,
          direction: "backward",
        },
        showErrorAlert: false,
      })
      .subscribe({
        next: (response) => {
          if (id !== request.current) {
            return;
          }
          try {
            setLogs(decodeLoki(response.data));
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Unable to parse Loki response.",
            );
          }
          setLoading(false);
        },
        error: (err) => {
          if (id !== request.current) {
            return;
          }
          setError(
            String(
              err?.data?.message ||
                err?.message ||
                "Loki query failed. Check the data source and its permissions.",
            ),
          );
          setLoading(false);
        },
      });
    return () => {
      request.current++;
      subscription.unsubscribe();
    };
  }, [source, selection, refresh]);
  useEffect(() => {
    if (!autoRefresh || loading) {
      return;
    }
    const timer = window.setTimeout(
      () => setRefresh((value) => value + 1),
      10000,
    );
    return () => window.clearTimeout(timer);
  }, [autoRefresh, loading, refresh]);
  useEffect(() => {
    setVisibleCount(LOG_BATCH_SIZE);
  }, [search, filters, ascending]);
  const facetedLogs = useMemo(
    () =>
      logs.filter(
        (log) =>
          (!filters.container || log.container === filters.container) &&
          matchesSearch(log, search),
      ),
    [logs, filters, search],
  );
  const filtered = useMemo(
    () =>
      facetedLogs.filter(
        (log) => !filters.level || log.level === filters.level,
      ),
    [facetedLogs, filters.level],
  );
  const volumeStats = useMemo(
    () => ({
      total: facetedLogs.length,
      info: facetedLogs.filter((log) => log.level === "info").length,
      warn: facetedLogs.filter((log) => log.level === "warn").length,
      error: facetedLogs.filter((log) => log.level === "error").length,
    }),
    [facetedLogs],
  );
  const sorted = useMemo(
    () => (ascending ? [...filtered].reverse() : filtered),
    [filtered, ascending],
  );
  const bars = useMemo(
    () => histogram(filtered, range.start, range.end),
    [filtered, range],
  );
  const max = Math.max(1, ...bars);
  const rows = sorted.slice(0, visibleCount);
  const hasMoreRows = rows.length < sorted.length;
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMoreRows) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((count) =>
            Math.min(count + LOG_BATCH_SIZE, sorted.length),
          );
        }
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMoreRows, sorted.length, visibleCount]);
  const explore = `${config.appSubUrl ?? ""}/explore?schemaVersion=1&panes=${encodeURIComponent(JSON.stringify({ A: { datasource: source, queries: [{ refId: "A", expr: DEFAULT_QUERY, queryType: "range", datasource: { type: "loki", uid: source } }], range: { from: String(range.start), to: String(range.end) } } }))}`;
  const drilldown = drilldownUrl(config.appSubUrl ?? "", source, range);
  const timeLabel = (time: number) =>
    new Date(time).toLocaleTimeString([], {
      ...(range.end - range.start >= 86400000
        ? { month: "short" as const, day: "numeric" as const }
        : {}),
      hour: "2-digit",
      minute: "2-digit",
      ...(range.end - range.start < 60000
        ? { second: "2-digit" as const }
        : {}),
    });
  return (
    <main className={`pino-app ${config.theme2.isDark ? "" : "pino-light"}`}>
      <header className="pino-header">
        <div>
          <div className="pino-eyebrow">OBSERVABILITY / LOGS</div>
          <h1>Pretty Pino Logs</h1>
          <p>Structured logs. A clearer picture.</p>
        </div>
        <div className="pino-header-actions">
          <span className="pino-tag">
            {source === "demo" ? "Sample data" : "Loki"}
          </span>
          {source === "demo" ? (
            <>
              <button
                disabled
                title="Select a Loki data source in Grafana to open Explore"
              >
                Open in Explore ↗
              </button>
              <button
                disabled
                title="Select a Loki data source in Grafana to open Logs Drilldown"
              >
                Logs Drilldown ↗
              </button>
            </>
          ) : (
            <>
              <a
                className="pino-button"
                href={explore}
                title="Open the executed LogQL query and time range"
              >
                Open in Explore ↗
              </a>
              <a
                className="pino-button"
                href={drilldown}
                title="Open Logs Drilldown with this data source and time range. Requires the Logs Drilldown app; local filters and LogQL are not transferred."
              >
                Logs Drilldown ↗
              </a>
            </>
          )}
        </div>
      </header>
      <section className="pino-toolbar" aria-label="Query controls">
        <Select
          label="Data source"
          value={source}
          onChange={(value) => {
            setSource(value);
            setFilters({
              container: "",
              level: "",
            });
          }}
          options={[
            ...sources.map((s) => ({ value: s.uid, label: s.name })),
            { value: "demo", label: "Demo · sample Pino logs" },
          ]}
        />
        <Select
          label="Time range"
          value={
            selection.kind === "relative" ? String(selection.minutes) : "custom"
          }
          onChange={(value) => {
            if (value === "custom") {
              setCustomFrom(localDateTime(range.start));
              setCustomTo(localDateTime(range.end));
              setRangeError("");
              setCustomOpen(true);
            } else {
              setSelection({ kind: "relative", minutes: Number(value) });
              setCustomOpen(false);
            }
          }}
          options={[
            ...[5, 15, 30, 60, 360, 1440].map((n) => ({
              value: String(n),
              label:
                n < 60
                  ? `Last ${n} minutes`
                  : n < 1440
                    ? `Last ${n / 60} ${n === 60 ? "hour" : "hours"}`
                    : "Last 24 hours",
            })),
            { value: "custom", label: "Custom date/time range…" },
          ]}
        />
        <Select
          label="Container"
          value={filters.container}
          onChange={(value) =>
            setFilters((previous) => ({ ...previous, container: value }))
          }
          options={[
            { value: "", label: "All containers" },
            ...Array.from(
              new Set([...logs.map((log) => log.container), filters.container]),
            )
              .filter(Boolean)
              .sort()
              .map((value) => ({ value, label: value })),
          ]}
        />
        <Select
          label="Severity"
          value={filters.level}
          onChange={(value) =>
            setFilters((previous) => ({ ...previous, level: value }))
          }
          options={[
            { value: "", label: "All severities" },
            ...Array.from(new Set([...levels, filters.level]))
              .filter(Boolean)
              .map((value) => ({ value, label: value })),
          ]}
        />
        <button
          className="pino-date-button"
          aria-expanded={customOpen}
          onClick={() => {
            setCustomFrom(localDateTime(range.start));
            setCustomTo(localDateTime(range.end));
            setRangeError("");
            setCustomOpen(!customOpen);
          }}
        >
          Choose dates…
        </button>
        <button
          onClick={() => setRefresh((value) => value + 1)}
          disabled={loading}
        >
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
        <label className="pino-auto">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />{" "}
          Refresh every 10s
        </label>
        <button
          className="pino-quiet"
          onClick={() => {
            setFilters({ container: "", level: "" });
            setSearch("");
          }}
          disabled={!filters.container && !filters.level && !search}
        >
          Reset
        </button>
      </section>
      {customOpen && (
        <form
          className="pino-custom-range"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const values = new FormData(event.currentTarget);
              const chosen = parseCustomRange(
                String(values.get("from") ?? ""),
                String(values.get("to") ?? ""),
              );
              setSelection({ kind: "absolute", range: chosen });
              setRangeError("");
              setCustomOpen(false);
            } catch (err) {
              setRangeError(
                err instanceof Error ? err.message : "Invalid time range.",
              );
            }
          }}
        >
          <label>
            From
            <input
              aria-label="From date and time"
              type="datetime-local"
              step="0.001"
              name="from"
              defaultValue={customFrom}
              required
            />
          </label>
          <label>
            To
            <input
              aria-label="To date and time"
              type="datetime-local"
              step="0.001"
              name="to"
              defaultValue={customTo}
              required
            />
          </label>
          <button className="pino-primary" type="submit">
            Apply time range
          </button>
          <button type="button" onClick={() => setCustomOpen(false)}>
            Cancel
          </button>
          <span>
            Local time · {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </span>
          {rangeError && <div role="alert">{rangeError}</div>}
        </form>
      )}
      <div className="pino-range-summary">
        {new Date(range.start).toLocaleString()} —{" "}
        {new Date(range.end).toLocaleString()} ·{" "}
        {selection.kind === "absolute" ? "Fixed range" : "Relative range"}
      </div>
      {source === "demo" && (
        <div className="pino-notice">
          Demo mode uses generated Pino logs. Select a configured Loki data
          source to query your own logs.
        </div>
      )}
      <div className="pino-search">
        <span aria-hidden="true">⌕</span>
        <input
          aria-label="Search loaded logs"
          placeholder="Search loaded logs…  level=ERROR requestId=req-0001"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <kbd>AND</kbd>
      </div>
      <div className="pino-hint">
        Filters and search apply to loaded logs. Times are local.
      </div>
      {error && (
        <div className="pino-error" role="alert">
          <strong>Could not load logs</strong>
          <p>{error}</p>
        </div>
      )}
      <section className="pino-panel" aria-label="Loaded log volume">
        <div className="pino-panel-heading">
          <h2>
            Log volume <span>· loaded results</span>
          </h2>
          <span>{filtered.length.toLocaleString()} matching entries</span>
        </div>
        <div className="pino-chart">
          <div className="pino-axis">
            <span>{max}</span>
            <span>{Math.floor(max / 2)}</span>
            <span>0</span>
          </div>
          <div
            className="pino-bars"
            role="img"
            aria-label={`Histogram of ${filtered.length} matching loaded logs across the selected time range`}
          >
            {bars.map((count, index) => (
              <div
                className="pino-bar-slot"
                key={index}
                title={`${timeLabel(range.start + (index / bars.length) * (range.end - range.start))}: ${count} logs`}
              >
                <div style={{ height: `${(count / max) * 100}%` }} />
              </div>
            ))}
          </div>
        </div>
        <div className="pino-ticks">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <span key={fraction}>
              {timeLabel(range.start + fraction * (range.end - range.start))}
            </span>
          ))}
        </div>
        <div className="pino-legend">
          <i /> Matching logs{" "}
          <span>Updated {new Date(updatedAt).toLocaleTimeString()}</span>
        </div>
        <div className="pino-volume-stats" aria-label="Filter by severity">
          {(
            [
              ["", "Total", volumeStats.total],
              ["info", "Info", volumeStats.info],
              ["warn", "Warn", volumeStats.warn],
              ["error", "Error", volumeStats.error],
            ] as const
          ).map(([level, label, count]) => (
            <button
              key={label}
              className={level || "total"}
              aria-pressed={filters.level === level}
              onClick={() => setFilters((previous) => ({ ...previous, level }))}
            >
              <span>{label}</span>
              <strong>{count.toLocaleString()}</strong>
            </button>
          ))}
        </div>
      </section>
      <section
        className="pino-panel pino-log-panel"
        aria-label="Logs"
        aria-busy={loading}
      >
        <div className="pino-panel-heading">
          <div>
            <h2>Logs</h2>
            <p>
              {loading
                ? "Fetching logs…"
                : `${filtered.length} matching / ${logs.length} loaded${logs.length >= LIMIT ? ` · limit of ${LIMIT} reached; narrow the time range` : ""}`}
            </p>
          </div>
          <button onClick={() => setAscending((value) => !value)}>
            {ascending ? "Oldest first ↑" : "Newest first ↓"}
          </button>
        </div>
        <div className="pino-table-wrap">
          <table>
            <thead>
              <tr>
                <th className="pino-date">Date</th>
                <th>Severity</th>
                <th>Container</th>
                <th className="pino-content">Content</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((log) => (
                <React.Fragment key={log.id}>
                  <tr
                    className={
                      selectedLog?.id === log.id ? "pino-selected" : ""
                    }
                    onClick={() => setSelectedLog(log)}
                  >
                    <td className="pino-date">
                      <span className={`pino-marker ${log.level}`} />
                      {new Date(log.timestamp).toLocaleString([], {
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        fractionalSecondDigits: 3,
                      } as Intl.DateTimeFormatOptions)}
                    </td>
                    <td>
                      <span className={`pino-level ${log.level}`}>
                        {log.level}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`pino-service color-${Array.from(log.container).reduce((a, c) => a + c.charCodeAt(0), 0) % 5}`}
                      >
                        {log.container}
                      </span>
                    </td>
                    <td>
                      <button
                        className="pino-message"
                        aria-haspopup="dialog"
                        aria-expanded={selectedLog?.id === log.id}
                        aria-label={`Show details: ${log.message}`}
                        onClick={() => setSelectedLog(log)}
                      >
                        <span className="pino-chevron">{"›"}</span>
                        <span>{log.message}</span>
                        {getField(log, "requestId") != null && (
                          <small>
                            requestId={String(getField(log, "requestId"))}
                          </small>
                        )}
                      </button>
                    </td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="pino-empty">
            {loading
              ? "Loading logs…"
              : error
                ? "Resolve the query error above and try again."
                : logs.length
                  ? "No logs match these filters. Try clearing the search or resetting filters."
                  : "No logs in this time range. Try a wider time range."}
          </div>
        )}
        {rows.length > 0 && (
          <footer className="pino-infinite-status" aria-live="polite">
            <span>
              Showing {rows.length.toLocaleString()} of{" "}
              {filtered.length.toLocaleString()} loaded logs
            </span>
            {hasMoreRows ? (
              <div ref={loadMoreRef} className="pino-load-more-sentinel">
                Scroll to load the next{" "}
                {Math.min(LOG_BATCH_SIZE, sorted.length - rows.length)} logs
              </div>
            ) : (
              <span>End of loaded logs</span>
            )}
          </footer>
        )}
      </section>
      {selectedLog && (
        <LogDrawer
          key={selectedLog.id}
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </main>
  );
}
