#!/usr/bin/env bash
#
# Inspecte les masters avant encodage.
#
# Les deux videos etant interchangeables a chaud, elles doivent partager la
# meme structure temporelle : une intro plus longue d'un cote produirait une
# incoherence au moment de la bascule. Ce script le verifie, et rappelle les
# valeurs a passer a encode.sh.
#
# Usage : ./scripts/probe.sh masters/*.mp4

set -euo pipefail

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe est introuvable. Installation : brew install ffmpeg" >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  echo "Usage : $0 <master1.mp4> [master2.mp4 ...]" >&2
  exit 1
fi

field() {
  ffprobe -v error -select_streams v:0 -show_entries "$2" -of default=nw=1:nk=1 "$1" | head -1
}

durations=""

for input in "$@"; do
  if [ ! -f "$input" ]; then
    echo "Fichier introuvable : $input" >&2
    exit 1
  fi

  duration=$(field "$input" format=duration)
  [ -n "$duration" ] || duration=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$input")

  width=$(field "$input" stream=width)
  height=$(field "$input" stream=height)
  rate=$(field "$input" stream=r_frame_rate)
  codec=$(field "$input" stream=codec_name)
  frames=$(ffprobe -v error -select_streams v:0 -count_frames \
    -show_entries stream=nb_read_frames -of default=nw=1:nk=1 "$input" 2>/dev/null || echo "?")

  fps=$(awk -F/ '{ if ($2) printf "%.3f", $1 / $2; else print $1 }' <<<"$rate")

  echo "== $(basename "$input")"
  echo "   codec       : ${codec}"
  echo "   resolution  : ${width}x${height}"
  echo "   cadence     : ${fps} fps"
  echo "   duree       : $(printf '%.3f' "$duration") s"
  echo "   images      : ${frames}"
  echo "   poids       : $(du -h "$input" | cut -f1)"

  durations="${durations} $(printf '%.2f' "$duration")"
done

unique=$(tr ' ' '\n' <<<"$durations" | sed '/^$/d' | sort -u | wc -l | tr -d ' ')

echo
if [ "$unique" -gt 1 ]; then
  echo "Les masters n'ont pas la meme duree (${durations# }). C'est normal :"
  echo "chaque video porte son propre data-vb-transition, la progression du"
  echo "scroll est mappee independamment."
else
  echo "Les masters partagent la meme duree."
fi

echo
echo "Les durees differentes sont prevues : chaque video porte son propre"
echo "data-vb-transition. Encoder ensuite :"
echo "  ./scripts/encode.sh masters/video1.mp4:166:398 masters/video2.mp4:116:247"
