#!/bin/sh
# Pult Component Atlas: inventory of every version, the parts joined to it, the page beside them (tools/arch/out, for the
# artifact) and the installable web app (atlas/, served by GitHub Pages at /lesepult/atlas/)
set -e
D=$(cd "$(dirname "$0")" && pwd); R=$(cd "$D/../.." && pwd)
mkdir -p "$D/out"
python3 "$D/archgen.py" "$R" "$D/out"
python3 "$D/merge.py" "$D/parts" "$D/out/current.json" "$D/out/model.json"
cp "$D/atlas.html" "$D/out/atlas.html"
# the web app (atlas/) only when asked – GitHub builds and commits it after each push (.github/workflows/atlas.yml)
if [ "$1" = "--site" ]; then python3 "$D/site.py" "$D/out" "$R/atlas"; fi
