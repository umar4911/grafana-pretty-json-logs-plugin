#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

version="$(node -p "require('./package.json').version")"
plugin_id="$(node -p "require('./src/plugin.json').id")"
plugin_version="$(node -p "require('./src/plugin.json').info.version")"

if [[ "$plugin_version" != "$version" ]]; then
  echo "package.json version $version does not match plugin.json version $plugin_version" >&2
  exit 1
fi

if [[ ! -f dist/plugin.json || ! -f dist/module.js ]]; then
  echo "The production build is incomplete. Run npm run build first." >&2
  exit 1
fi

staging="$(mktemp -d)"
archive="$project_dir/$plugin_id-$version.zip"
trap 'rm -rf "$staging"' EXIT

rm -f "$archive"
cp -R dist "$staging/$plugin_id"

(
  cd "$staging"
  zip -qr "$archive" "$plugin_id"
)

unzip -tq "$archive"

echo
echo "Created installable Grafana plugin package:"
ls -lh "$archive"
