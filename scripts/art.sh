#!/bin/sh
# Turns the illustration originals in art-sources/ (kept out of the repo: ~1 MB each) into what the app ships:
# compressed illustrations in src/assets/art/, the app icons in public/, and the link preview image.
# Needs ImageMagick 7 (`magick`). Run from anywhere: sh scripts/art.sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p src/assets/art

for src in art-sources/*.png; do
  name=$(basename "$src" .png)
  case "$name" in icon* | og) continue ;; esac
  # Faint pixels, and faint pale ones (the glow the generator adds around shapes), turn into a grey fog on the dark theme.
  magick "$src" -channel A -fx "a<0.08 || (a<0.45 && min(min(r,g),b)>0.7) ? 0 : a" +channel -trim +repage -resize 360x360 \
    -quality 82 -define webp:alpha-quality=90 "src/assets/art/$name.webp"
done

icon=art-sources/icon.png
magick "$icon" -resize 512x512 -strip public/icon-512.png
magick "$icon" -resize 192x192 -strip public/icon-192.png
magick "$icon" -resize 180x180 -strip public/apple-touch-icon.png
magick "$icon" -resize 48x48 public/favicon.ico
# Android crops maskable icons to a circle or squircle: shrink the drawing into the safe zone and let the gradient's
# edge colours fill the border.
magick "$icon" -resize 512x512 -virtual-pixel Edge -distort SRT "256,256 0.78 0" -strip public/icon-maskable-512.png

magick art-sources/og.png -resize 1200x630^ -gravity center -extent 1200x630 -strip -quality 85 public/og.jpg
