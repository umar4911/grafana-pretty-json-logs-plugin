# Pretty Pino Logs

A Grafana **app plugin** inspired by the supplied Pretty Logs screenshot. Queries an existing Loki data source through Grafana's authenticated data proxy. Pino logs must already be shipped to Loki (for example, using Grafana Alloy); this plugin does not collect stdout.

## Develop

Requires Node.js 22+ and Docker Compose for the local Grafana/Loki environment.

```sh
npm install
npm run build
docker compose up -d
npm run seed
```

Open http://localhost:3000/a/umar-prettypino-app/explore and sign in with the **local development** account `admin` / `admin`. The app and local Loki data source are provisioned automatically. Run `npm run dev` to rebuild on edits and refresh Grafana. Stop with `docker compose down`.

For an existing Grafana 12.2+ instance, copy `dist` to its plugin directory as `umar-prettypino-app`, allow the unsigned plugin in a development environment, restart Grafana, and enable Pretty Pino Logs under Administration → Plugins. Production distribution requires Grafana plugin signing. Select your configured Loki data source and adapt the default `{container=~".+"}` LogQL query to your stream labels. Credentials remain in Grafana's data-source configuration.

For a standalone UI preview without Docker, run `npm run preview` and open http://localhost:4173. This preview uses only generated sample logs; live data-source queries require Grafana.

## Viewer behavior

- Preset relative time ranges and arbitrary custom start/end dates with millisecond precision in local time. Custom ranges stay fixed during refresh. Manual refresh, optional 10-second polling, and an Explore link carry the executed LogQL query and time range. Logs Drilldown opens the selected data source and time range (requires the Grafana Logs Drilldown app); it does not transfer the LogQL query or local filters. Both navigation buttons are visible but disabled in demo mode.
- Container and severity dropdowns filter the **loaded results**. Container names come from `container`, `container_name`, or `docker_container_name` labels, then Pino `container`, `container_name`, or `hostname`. Adapt the LogQL selector if your Loki label uses a different name.
- Search combines terms with AND: `level=ERROR requestId=req-0001`, `req.method=POST`, `msg="request completed"`, or plain text. `key=value` compares exact values; severity accepts numeric Pino levels or case-insensitive names. Plain text is case-insensitive. Values containing spaces must be quoted. This is a small search syntax, not LogQL.
- Up to 1,000 latest entries per query. The first 100 logs render immediately, then another 100 are appended whenever the end of the list approaches; there are no page controls. Both filters and histogram operate on those loaded entries, **not a full-range backend count**. A notice appears when the limit is reached. Narrow the LogQL query to find older or otherwise excluded entries.
- Maps Pino 10/20/30/40/50/60 to trace/debug/info/warn/error/fatal. Preserves raw JSON and unknown fields. Malformed JSON and plain text remain readable. Loki timestamps control ordering and histogram buckets; the original Pino `time` remains in details.
- Click a log to open a full-height right sidebar with the selected message, timestamp, container, and severity. Search its keys and values, expand or collapse JSON objects and arrays, switch to stream labels, and copy the raw line. Close with Escape, the close button, or the backdrop. The sidebar search leaves the main log search unchanged. Rendering uses React text nodes, never raw HTML.
- Demo mode is explicitly labeled and works without a Loki data source. It never activates as a fallback for a failed live query.

## Validation

```sh
npm run typecheck
npm test
npm run build
```

## GitHub automation

The repository is safe to keep public. Source, tests, screenshots, and compiled
release files are public; Grafana tokens, VPS credentials, SSH keys, host keys,
and environment-specific values belong in GitHub Secrets or Variables.

- `CI` runs the type checker, tests, and production build for pushes and pull
  requests to `main`.
- `Release` runs Grafana's official build action for tags such as `v0.1.0`. The
  tag must match both `package.json` and `src/plugin.json`. It validates and
  packages the plugin, optionally signs it, creates build provenance for this
  public repository, and opens a draft GitHub release.
- Deployment to the Ubuntu VPS is manual. Build or download a release package,
  copy it to the server, install it under `/var/lib/grafana/plugins`, and restart
  `grafana-server` using the procedure below.

Private signing requires `GRAFANA_ACCESS_POLICY_TOKEN` and the exact Grafana
root URL in `GRAFANA_ROOT_URLS`. The organization prefix in the plugin ID must
match the Grafana Cloud organization that issued the token. Until that is
configured, releases remain unsigned and the self-hosted Grafana instance must
explicitly allow `umar-prettypino-app`.

## Manual deployment to Ubuntu

The plugin requires Grafana 12.2 or newer. Check the installed version on the
VPS before deploying:

```sh
grafana-server -v || grafana server -v
```

### 1. Build and package the plugin

You can download the ZIP produced by a tagged GitHub release, or build the same
package locally:

```sh
npm ci
npm run typecheck
npm test
npm run build

release_dir="$(mktemp -d)"
cp -R dist "$release_dir/umar-prettypino-app"
(cd "$release_dir" && zip -qr umar-prettypino-app-0.1.0.zip umar-prettypino-app)
cp "$release_dir/umar-prettypino-app-0.1.0.zip" .
```

The ZIP must contain one top-level directory named `umar-prettypino-app`, with
`plugin.json` directly inside it.

### 2. Copy the package to the VPS

```sh
scp umar-prettypino-app-0.1.0.zip YOUR_USER@YOUR_VPS:/tmp/
```

### 3. Allow the unsigned plugin initially

Skip this step after private plugin signing is configured. On the VPS, edit
`/etc/grafana/grafana.ini` and add the plugin ID:

```ini
[plugins]
allow_loading_unsigned_plugins = umar-prettypino-app
```

If `[plugins]` already exists, add the setting to that section rather than
creating a duplicate section.

### 4. Install the release with a rollback copy

Run the following on the VPS. Change the archive version when deploying a newer
release:

```sh
archive=/tmp/umar-prettypino-app-0.1.0.zip
staging="$(mktemp -d)"
backup="/var/backups/grafana-plugins/umar-prettypino-app-$(date -u +%Y%m%dT%H%M%SZ)"

unzip -q "$archive" -d "$staging"
test -f "$staging/umar-prettypino-app/plugin.json"

sudo systemctl stop grafana-server
sudo install -d -o grafana -g grafana /var/lib/grafana/plugins
sudo install -d -o root -g root /var/backups/grafana-plugins

if sudo test -d /var/lib/grafana/plugins/umar-prettypino-app; then
  sudo mv /var/lib/grafana/plugins/umar-prettypino-app "$backup"
fi

sudo mv "$staging/umar-prettypino-app" /var/lib/grafana/plugins/
sudo chown -R grafana:grafana /var/lib/grafana/plugins/umar-prettypino-app
sudo systemctl start grafana-server
```

### 5. Verify and enable the app

```sh
sudo systemctl is-active grafana-server
sudo journalctl -u grafana-server -n 100 --no-pager
```

Confirm the logs show `umar-prettypino-app` loading. Then sign in to Grafana as
an administrator, open **Administration → Plugins and data → Plugins**, select
**Pretty Pino Logs**, and enable the app. Its page is available at:

```text
https://YOUR_GRAFANA_HOST/a/umar-prettypino-app/explore
```

For subsequent releases, repeat the package, copy, install, and verification
steps. Each installation moves the previous plugin into
`/var/backups/grafana-plugins`, making rollback possible.

The local sample seeder writes synthetic Pino entries to the development Loki on localhost:3100. Do not point it at production.

## References

- [Grafana app plugins](https://grafana.com/developers/plugin-tools/tutorials/build-an-app-plugin)
- [Grafana data proxy](https://grafana.com/developers/plugin-tools/how-to-guides/data-source-plugins/fetch-data-from-frontend)
- [Loki HTTP API](https://grafana.com/docs/loki/latest/reference/loki-http-api/)
- [Pino API](https://github.com/pinojs/pino/blob/main/docs/api.md)
