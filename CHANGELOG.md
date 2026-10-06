# Changelog

## 0.1.2 - 2026-10-06

- Stop automatic polling when Live is turned off.
- Enable Live when an automatic refresh interval is selected.

## 0.1.1 - 2026-10-06

- Keep data source, time range, container, and severity controls aligned in Grafana.
- List only configured Loki data sources in production.
- Add selectable automatic refresh intervals and a moving Live range.
- Add clickable severity counts below the log-volume chart.
- Add a local `npm run package` command for installable ZIP archives.

## 0.1.0 - 2026-10-01

- Add a Loki-backed Grafana app for structured Pino logs.
- Add container and severity filters, LogQL search, and custom time ranges.
- Add infinite scrolling in batches of 100 logs.
- Add a searchable, collapsible JSON detail drawer.
- Add links to Grafana Explore and Logs Drilldown.
- Add CI, release packaging, signing support, and gated VPS deployment.
