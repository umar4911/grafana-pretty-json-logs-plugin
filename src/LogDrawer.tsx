import React, { useEffect, useRef, useState } from "react";
import { LogEntry } from "./logs";

function contains(value: unknown, key: string, search: string): boolean {
  return (
    key.toLowerCase().includes(search) ||
    (JSON.stringify(value) ?? "").toLowerCase().includes(search)
  );
}
function JsonNode({
  name,
  value,
  path,
  depth,
  search,
  opened,
  setOpened,
  defaultOpen,
}: {
  name: string;
  value: unknown;
  path: string;
  depth: number;
  search: string;
  opened: Record<string, boolean>;
  setOpened: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  defaultOpen: boolean;
}) {
  const branch = value !== null && typeof value === "object";
  const entries = branch ? Object.entries(value) : [];
  const array = Array.isArray(value);
  const open = opened[path] ?? (search ? true : defaultOpen);
  const visible =
    search && !name.toLowerCase().includes(search)
      ? entries.filter(([key, item]) => contains(item, key, search))
      : entries;
  const keyMatches = Boolean(search && name.toLowerCase().includes(search));
  return (
    <div className="pino-json-node">
      <div className="pino-json-line">
        {branch && entries.length > 0 ? (
          <button
            className="pino-json-toggle"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${name || "root"}`}
            onClick={() =>
              setOpened((previous) => ({ ...previous, [path]: !open }))
            }
          >
            {open ? "⌄" : "›"}
          </button>
        ) : (
          <span className="pino-json-spacer" />
        )}
        {name && (
          <>
            <span
              className={`pino-json-key ${keyMatches ? "pino-json-match" : ""}`}
            >
              {JSON.stringify(name)}
            </span>
            <span>: </span>
          </>
        )}
        {branch ? (
          <span className="pino-json-punctuation">
            {array ? "[" : "{"}
            {!open && (
              <span className="pino-json-count">
                {" "}
                {entries.length} {array ? "items" : "keys"}{" "}
              </span>
            )}
            {(!open || !entries.length) && (array ? "]" : "}")}
          </span>
        ) : (
          <span
            className={`pino-json-value type-${value === null ? "null" : typeof value} ${search && String(value).toLowerCase().includes(search) ? "pino-json-match" : ""}`}
          >
            {JSON.stringify(value)}
          </span>
        )}
      </div>
      {branch && open && entries.length > 0 && (
        <>
          <div className="pino-json-children">
            {visible.map(([key, item]) => (
              <JsonNode
                key={key}
                name={key}
                value={item}
                path={`${path}/${JSON.stringify(key)}`}
                depth={depth + 1}
                search={name.toLowerCase().includes(search) ? "" : search}
                opened={opened}
                setOpened={setOpened}
                defaultOpen={defaultOpen}
              />
            ))}
          </div>
          <div className="pino-json-end">{array ? "]" : "}"}</div>
        </>
      )}
    </div>
  );
}
export function LogDrawer({
  log,
  onClose,
}: {
  log: LogEntry;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [defaultOpen, setDefaultOpen] = useState(true);
  const [copied, setCopied] = useState("");
  const [tab, setTab] = useState<"json" | "labels">("json");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    element.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);
  let payload: unknown;
  try {
    payload = JSON.parse(log.raw);
  } catch {
    payload = log.raw;
  }
  const value = tab === "json" ? payload : log.labels;
  const needle = search.trim().toLowerCase();
  const hasMatches = !needle || contains(value, "", needle);
  return (
    <dialog
      className="pino-drawer"
      ref={dialog}
      aria-labelledby="pino-drawer-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          ) {
            onClose();
          }
        }
      }}
    >
      <header className="pino-drawer-heading">
        <div>
          <div className="pino-eyebrow">SELECTED LOG</div>
          <h2 id="pino-drawer-title">Log details</h2>
        </div>
        <button autoFocus aria-label="Close log details" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="pino-drawer-summary">
        <div className="pino-drawer-tags">
          <span className={`pino-level ${log.level}`}>{log.level}</span>
          <span className="pino-service">{log.container}</span>
          <time dateTime={new Date(log.timestamp).toISOString()}>
            {new Date(log.timestamp).toLocaleString()}
          </time>
        </div>
        <p>{log.message}</p>
      </div>
      <div className="pino-drawer-search">
        <span aria-hidden="true">⌕</span>
        <input
          aria-label="Search selected log"
          placeholder="Search this log’s keys and values…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setOpened({});
          }}
        />
        {search && (
          <button
            aria-label="Clear selected log search"
            onClick={() => {
              setSearch("");
              setOpened({});
            }}
          >
            ✕
          </button>
        )}
      </div>
      <div className="pino-drawer-tools">
        <div
          className="pino-drawer-tabs"
          role="group"
          aria-label="Log information"
        >
          <button aria-pressed={tab === "json"} onClick={() => setTab("json")}>
            JSON
          </button>
          <button
            aria-pressed={tab === "labels"}
            onClick={() => setTab("labels")}
          >
            Labels
          </button>
        </div>
        <button
          onClick={() => {
            setDefaultOpen(true);
            setOpened({});
          }}
        >
          Expand all
        </button>
        <button
          onClick={() => {
            setDefaultOpen(false);
            setOpened({ "": true });
          }}
        >
          Collapse all
        </button>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(log.raw);
              setCopied("Copied raw log");
            } catch {
              setCopied("Copy unavailable. Select the text to copy.");
            }
          }}
        >
          Copy raw
        </button>
      </div>
      <div className="pino-drawer-status" role="status">
        {copied ||
          (search
            ? "Showing matching keys and values"
            : "Click an arrow to expand or collapse a key")}
      </div>
      <div className="pino-drawer-body">
        {hasMatches ? (
          <JsonNode
            name=""
            value={value}
            path=""
            depth={0}
            search={needle}
            opened={opened}
            setOpened={setOpened}
            defaultOpen={defaultOpen}
          />
        ) : (
          <div className="pino-empty">No keys or values match “{search}”.</div>
        )}
      </div>
    </dialog>
  );
}
