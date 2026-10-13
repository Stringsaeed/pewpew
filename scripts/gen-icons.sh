#!/bin/zsh
# Cuts the Android adaptive-icon layers from design/rocket-icon/layers with rsvg-convert.
# foreground: the rocket layers at 66% (the adaptive safe zone) on transparency; monochrome: the same silhouette in white;
# background: the space plate as is. Rerun after editing the layers. The wrapper SVGs are written next to the layers
# because librsvg only loads images from the SVG's own directory.
set -e
cd "$(dirname "$0")/.."
L="$PWD/design/rocket-icon/layers"; O="$PWD/design/rocket-icon/android"
mkdir -p "$O"
layers() { for n in 03-pink-echo 04-flame 05-fins 06-rocket-body 07-porthole; do echo "<image href=\"$n.png\" width=\"1024\" height=\"1024\"/>"; done }
{ echo '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><g transform="translate(512 512) scale(0.66) translate(-512 -512)">'; layers; echo '</g></svg>'; } > "$L/.fg.svg"
{ echo '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><defs><filter id="w" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/></filter></defs><g filter="url(#w)" transform="translate(512 512) scale(0.66) translate(-512 -512)">'; layers; echo '</g></svg>'; } > "$L/.mono.svg"
rsvg-convert -w 1024 -h 1024 -o "$O/foreground.png" "$L/.fg.svg"
rsvg-convert -w 1024 -h 1024 -o "$O/monochrome.png" "$L/.mono.svg"
rm -f "$L/.fg.svg" "$L/.mono.svg"
cp "$L/01-space.png" "$O/background.png"
echo "wrote $O/{foreground,monochrome,background}.png"
