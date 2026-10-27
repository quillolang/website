#!/bin/sh
# Links content/ to a checkout of quillolang/quillo: the docs are made from its
# README.md, USERGUIDE.md and examples/. QUILLO_DIR names the checkout
# (../quillo by default).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
quillo_dir=$(cd "${QUILLO_DIR:-$here/../quillo}" && pwd)
mkdir -p "$here/content"
for f in README.md USERGUIDE.md examples; do
    ln -sfn "$quillo_dir/$f" "$here/content/$f"
done
