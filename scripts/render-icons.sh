#!/usr/bin/env bash
# Render the extension icons from the SVG sources in assets/ (needs Inkscape).
set -euo pipefail
cd "$(dirname "$0")/.."
out=extension/icons
mkdir -p "$out"
render() { inkscape "assets/$1" --export-type=png --export-filename="$out/icon-$2.png" -w "$2" -h "$2" >/dev/null 2>&1; }
render icon-16.svg 16
render icon-small.svg 32
render icon-small.svg 48
render icon.svg 128
ls -l "$out"
