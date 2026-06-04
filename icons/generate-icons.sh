#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
SVG="$DIR/icon.svg"
TMP="$DIR/.icon-512.png"

qlmanage -t -s 512 -o "$DIR" "$SVG" >/dev/null 2>&1
mv -f "$DIR/icon.svg.png" "$TMP"

sips -z 512 512 "$TMP" --out "$DIR/icon-512.png" >/dev/null
sips -z 192 192 "$TMP" --out "$DIR/icon-192.png" >/dev/null
sips -z 180 180 "$TMP" --out "$DIR/apple-touch-icon.png" >/dev/null
sips -z 32 32 "$TMP" --out "$DIR/favicon-32.png" >/dev/null
rm -f "$TMP"
