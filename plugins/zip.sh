#!/bin/sh
# Makes plugins/quillo-plugins.zip: every plugin (.qwer), its example (.qwe) and the
# files the examples read, in a folder quillo-plugins/. The site serves it at
# /plugins/files/quillo-plugins.zip; export.sh and a deploy run this first.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
mkdir "$tmp/quillo-plugins"
cp "$here"/*.qwer "$here"/*.qwe "$tmp/quillo-plugins/"
# The files the examples read: each catalog entry's `files`.
for f in $(node -e 'for (const p of require(process.argv[1])) for (const f of p.files ?? []) console.log(f)' "$here/catalog.json"); do
    cp "$here/$f" "$tmp/quillo-plugins/"
done
rm -f "$here/quillo-plugins.zip"
(cd "$tmp" && zip -q -X -r "$here/quillo-plugins.zip" quillo-plugins)
rm -rf "$tmp"
echo "plugins/quillo-plugins.zip: $(ls "$here"/*.qwer | wc -l | tr -d ' ') plugins"
