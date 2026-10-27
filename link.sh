#!/bin/sh
# Links content/ to checkouts of quillolang/quillo, quillolang/examples and
# quillolang/components: the docs are made from quillo's README.md and
# USERGUIDE.md, the examples' pages from the examples, and /components/ from the
# components. QUILLO_DIR, QUILLO_EXAMPLES and QUILLO_COMPONENTS name the checkouts
# (../quillo, ../quillo-examples and ../quillo-components by default).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
quillo_dir=$(cd "${QUILLO_DIR:-$here/../quillo}" && pwd)
examples_dir=$(cd "${QUILLO_EXAMPLES:-$here/../quillo-examples}" && pwd)
components_dir=$(cd "${QUILLO_COMPONENTS:-$here/../quillo-components}" && pwd)
mkdir -p "$here/content"
for f in README.md USERGUIDE.md; do
    ln -sfn "$quillo_dir/$f" "$here/content/$f"
done
ln -sfn "$examples_dir" "$here/content/examples"
ln -sfn "$components_dir" "$here/content/components"
