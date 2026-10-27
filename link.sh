#!/bin/sh
# Links content/ to checkouts of quillolang/quillo and quillolang/examples: the
# docs are made from quillo's README.md and USERGUIDE.md, and the examples'
# pages from the examples. QUILLO_DIR and QUILLO_EXAMPLES name the checkouts
# (../quillo and ../quillo-examples by default).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
quillo_dir=$(cd "${QUILLO_DIR:-$here/../quillo}" && pwd)
examples_dir=$(cd "${QUILLO_EXAMPLES:-$here/../quillo-examples}" && pwd)
mkdir -p "$here/content"
for f in README.md USERGUIDE.md; do
    ln -sfn "$quillo_dir/$f" "$here/content/$f"
done
ln -sfn "$examples_dir" "$here/content/examples"
