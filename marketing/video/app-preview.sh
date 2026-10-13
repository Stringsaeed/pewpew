#!/usr/bin/env bash
# App Store app preview for 6.9" iPhone: 886x1920, 30 fps, H.264, stereo AAC, under 30 s.
# Footage is raw simulator recordings (xcrun simctl io recordVideo) of the bot playing; audio is the game's own synth
# rendered by `npm run render-song` into /tmp/pewpew-audio.
# usage: marketing/video/app-preview.sh <capture-dir> <out.mp4>
set -euo pipefail
CAP=${1:-/tmp/cap}
OUT=${2:-docs/app-store/preview/app-preview.mp4}
AUD=${AUDIO_DIR:-/tmp/pewpew-audio}
mkdir -p "$(dirname "$OUT")"

# source start duration
SEGS=(
  "menu-native 5.0 6"
  "lv30 55 3.5"
  "lv20 84 5"
  "lv10 66.5 5"
  "lv30 99 3.5"
  "lv30 111 3.6"
  "lv20 111.6 2.4"
)

inputs=()
filters=""
labels=""
i=0
for s in "${SEGS[@]}"; do
  read -r src start dur <<<"$s"
  inputs+=(-ss "$start" -t "$dur" -i "$CAP/$src.mp4")
  filters+="[$i:v]fps=30,scale=886:1925:flags=lanczos,crop=886:1920,setsar=1,setpts=PTS-STARTPTS[v$i];"
  labels+="[v$i]"
  i=$((i + 1))
done
n=$i

# Music bed: menu theme under the menus, tier 3 for the run, the boss loop for the fights, the level-clear stinger last.
filters+="${labels}concat=n=$n:v=1:a=0,format=yuv420p[v];"
a=$n
inputs+=(-i "$AUD/tier1.wav" -i "$AUD/tier3.wav" -stream_loop 2 -i "$AUD/boss.wav" -i "$AUD/complete.wav" -i "$AUD/tap.wav" -i "$AUD/tap.wav" -i "$AUD/explode.wav" -i "$AUD/explode.wav")
filters+="[$((a+0)):a]atrim=0:6.3,afade=t=out:st=5.9:d=0.4,adelay=0|0[m0];"
filters+="[$((a+1)):a]atrim=0:3.8,afade=t=in:d=0.1,afade=t=out:st=3.4:d=0.4,adelay=6000|6000[m1];"
filters+="[$((a+2)):a]atrim=0:17.3,afade=t=in:d=0.2,afade=t=out:st=16.9:d=0.4,adelay=9500|9500[m2];"
filters+="[$((a+3)):a]adelay=26600|26600[m3];"
filters+="[$((a+4)):a]adelay=1500|1500[t0];"
filters+="[$((a+5)):a]adelay=4500|4500[t1];"
filters+="[$((a+6)):a]adelay=18900|18900[x0];"
filters+="[$((a+7)):a]adelay=24600|24600[x1];"
filters+="[m0][m1][m2][m3][t0][t1][x0][x1]amix=inputs=8:normalize=0,volume=0.9,aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:29,afade=t=out:st=28.4:d=0.6[a]"

ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex "$filters" -map "[v]" -map "[a]" \
  -c:v libx264 -profile:v high -level 4.2 -pix_fmt yuv420p -r 30 -b:v 10M -maxrate 12M -bufsize 20M -preset slow \
  -c:a aac -b:a 256k -ar 48000 -ac 2 -t 29 -movflags +faststart "$OUT"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,sample_rate,channels -show_entries format=duration -of compact "$OUT"
