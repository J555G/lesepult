#!/bin/sh
# Pult Component Atlas: inventory of every version, the parts joined to it, the page beside them (in tools/arch/out)
set -e
D=$(cd "$(dirname "$0")" && pwd); R=$(cd "$D/../.." && pwd)
mkdir -p "$D/out"
python3 "$D/archgen.py" "$R" "$D/out"
python3 "$D/merge.py" "$D/parts" "$D/out/current.json" "$D/out/model.json"
cp "$D/atlas.html" "$D/out/atlas.html"
