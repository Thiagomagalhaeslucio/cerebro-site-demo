#!/bin/sh
# Gera os PNGs do favicon a partir de public/favicon.svg (precisa do rsvg-convert).
# O apple-touch-icon é quadrado até a borda: o iOS arredonda sozinho.
set -e
cd "$(dirname "$0")/../public"
rsvg-convert -w 32 -h 32 favicon.svg -o favicon-32.png
sed 's/ rx="7"//' favicon.svg | rsvg-convert -w 180 -h 180 -o apple-touch-icon.png
