#!/bin/sh
# Sets up the playground's runner on the server (Ubuntu 24.04, as root); running it again is
# safe. Then: install /usr/local/bin/quillo-play (cargo build --release in play/runner), and
#   systemctl enable --now quillo-play-spawner quillo-play-proxy
# QUILLO_BIN is the quillo programs run with (the site's own, so the docs match).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
ROOT=/var/lib/quillo-play
QUILLO_BIN=${QUILLO_BIN:-/srv/quillo-website/bin/quillo}

user() { id "$1" >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$1"; }
user quillo-play
for i in $(seq -w 1 20); do user "quillo-play-s$i"; done

install -d -m 0755 -o root -g root "$ROOT" "$ROOT/bin" "$ROOT/root"
install -d -m 0711 -o root -g root "$ROOT/src"
install -d -m 0750 -o root -g root "$ROOT/log"

# The sandboxes' root: empty folders to mount on, and the usual links into /usr.
cd "$ROOT/root"
for d in usr etc proc sys dev tmp src work opt run var var/tmp; do install -d -m 0755 "$d"; done
for l in bin lib lib64 sbin; do [ -L "$l" ] || ln -s "usr/$l" "$l"; done
for f in etc/ld.so.cache etc/localtime opt/quillo; do [ -e "$f" ] || : > "$f"; done
cd "$here"

# The quillo runs use: a copy, so the site's binary can change without a run noticing.
install -m 0755 -o root -g root "$QUILLO_BIN" "$ROOT/bin/quillo.new"
mv -f "$ROOT/bin/quillo.new" "$ROOT/bin/quillo"

# The API's secret, made once; the site gets the same in its site.env (PLAY_SECRET).
install -d -m 0750 -o root -g quillo-play /etc/quillo-play
if [ ! -s /etc/quillo-play/secret ]; then
    (umask 027; openssl rand -hex 32 > /etc/quillo-play/secret)
    chgrp quillo-play /etc/quillo-play/secret
fi

install -m 0644 quillo-play.slice quillo-play-spawner.service quillo-play-proxy.service /etc/systemd/system/
systemctl daemon-reload
echo "setup: done; $("$ROOT/bin/quillo" --version) for runs"
