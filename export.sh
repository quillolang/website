#!/bin/sh
# Renders the site to static files in dist/: every page in /sitemap.txt
# (as <path>/index.html), the component bundles they load, fonts, favicon and link preview. A static host serves them as they are; the
# components run in the browser and call nothing on the server.
#
# It runs the site with the quillo built in a checkout of quillolang/quillo
# (QUILLO_DIR, ../quillo by default), and links content/ to that checkout:
#
#   (cd ../quillo && cargo build --release) && ./export.sh
set -eu

here=$(cd "$(dirname "$0")" && pwd)
quillo_dir=$(cd "${QUILLO_DIR:-$here/../quillo}" && pwd)
quillo="$quillo_dir/target/release/quillo"
QUILLO_DIR="$quillo_dir" "$here/link.sh"
port=${PORT:-8790}
out="$here/dist"

rm -rf "$out"
mkdir -p "$out/_quillo/b"

"$quillo" run "$here/main.qwe" --port "$port" --log off &
pid=$!
trap 'kill $pid 2>/dev/null' EXIT

i=0
until curl -sf -o /dev/null "http://127.0.0.1:$port/"; do
    i=$((i + 1))
    [ $i -gt 50 ] && { echo "export: the site did not start" >&2; exit 1; }
    sleep 0.2
done

curl -sf "http://127.0.0.1:$port/sitemap.txt" -o "$out/sitemap.txt"
curl -sf "http://127.0.0.1:$port/sitemap.xml" -o "$out/sitemap.xml"
for path in $(sed 's|^https://[^/]*||' "$out/sitemap.txt"); do
    mkdir -p "$out$path"
    curl -sf "http://127.0.0.1:$port$path" -o "$out${path}index.html"
done
curl -sf "http://127.0.0.1:$port/favicon.svg" -o "$out/favicon.svg"
curl -sf "http://127.0.0.1:$port/robots.txt" -o "$out/robots.txt"
curl -sf "http://127.0.0.1:$port/banner.png" -o "$out/banner.png"
mkdir -p "$out/fonts"
for f in "$here"/public/fonts/*.woff2; do
    curl -sf "http://127.0.0.1:$port/fonts/${f##*/}" -o "$out/fonts/${f##*/}"
done
for js in $(find "$out" -name index.html -exec grep -oh '/_quillo/b/[0-9a-f]*\.js' {} + | sort -u); do
    curl -sf "http://127.0.0.1:$port$js" -o "$out$js"
done

# The kit's files, to download: the whole kit in one file, each component, and a
# zip of the repository's files (what git tracks, or all but dot-files).
kit="$here/content/components"
mkdir -p "$out/components/ui"
cp "$kit/quillo-ui.qwe" "$out/components/"
cp "$kit"/ui/*.qwe "$out/components/ui/"
(cd "$kit" && { git ls-files 2>/dev/null | grep . || find . -type f ! -path './.*' | sed 's|^\./||'; } \
    | sed 's|^|quillo-ui/|' > "$out/kit-files.txt")
tmpkit=$(mktemp -d)
ln -s "$kit" "$tmpkit/quillo-ui"
(cd "$tmpkit" && zip -q -X "$out/components/quillo-ui.zip" -@ < "$out/kit-files.txt")
rm -rf "$tmpkit" "$out/kit-files.txt"

# Bundles are named by their content, so browsers may keep them for good.
# Pages may be kept 30 seconds, as quillo run lets a prefetched page be kept:
# a browser without speculation rules fetches the page a link points to, and
# the click is answered from its cache. (LiteSpeed keeps a static file's
# headers whatever the request, so this cannot be for prefetches alone.)
cat > "$out/.htaccess" <<'EOF'
<IfModule mod_headers.c>
  <FilesMatch "\.(js|woff2)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "\.html$">
    Header set Cache-Control "private, max-age=30"
  </FilesMatch>
  <FilesMatch "\.qwe$">
    Header set Cache-Control "public, max-age=300"
  </FilesMatch>
</IfModule>
<IfModule mod_mime.c>
  AddType text/plain;charset=utf-8 .qwe
</IfModule>
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/plain application/javascript image/svg+xml
</IfModule>
EOF

find "$out" -type f | sed "s|$out/||" | sort
