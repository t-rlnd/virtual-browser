#!/usr/bin/env bash
#
# Encode les masters pour le scrub au scroll.
#
# Le point cle est le `-force_key_frames` : chaque image de la plage scrubee
# devient une image cle, ce qui permet au navigateur de sauter a n'importe
# quel instant sans decoder la sequence qui precede. Au-dela de cette plage on
# repasse en GOP normal, la boucle etant lue de facon lineaire : payer
# l'all-intra sur ce segment doublerait le poids pour rien.
#
# Chaque video ayant son propre decoupage, il se declare par fichier, en
# numeros d'image (la conversion en secondes utilise la cadence reelle) :
#
#   ./scripts/encode.sh masters/video1.mp4:166:398 masters/video2.mp4:116:247
#                                        ^    ^
#                                        |    derniere image de la boucle
#                                        derniere image du scrub
#
# Reglages (variables d'environnement) :
#   WIDTHS="750 1280 1920" largeurs generees
#   CRF=24                 qualite (plus bas = meilleur et plus lourd)
#   SCRUB_DIVISOR=1        decime la plage scrubee (2 = une image sur deux)
#   OUT_DIR=public/assets  dossier de sortie
#
# SCRUB_DIVISOR merite une explication. La plage all-intra represente pres de
# 90 % du poids du fichier : n'y garder qu'une image sur deux le reduit d'environ
# 40 %, sans toucher a la boucle qui conserve sa cadence pleine. Mais ce qui
# decide de la fluidite du scrub n'est pas la cadence, c'est le nombre de pixels
# de scroll par image. Le script l'affiche pour chaque encodage : au-dela d'une
# vingtaine de pixels par image, le scrub commence a se voir par a-coups.

set -euo pipefail

WIDTHS="${WIDTHS:-750 1280 1920}"
CRF="${CRF:-24}"
SCRUB_DIVISOR="${SCRUB_DIVISOR:-1}"
OUT_DIR="${OUT_DIR:-public/assets}"

# Hauteur de scroll utile, pour estimer la densite d'images. Le scrub court sur
# toute la hauteur de la section 1 (250vh par defaut).
SCROLL_HEIGHT="${SCROLL_HEIGHT:-2250}"

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffmpeg est introuvable. Installation : brew install ffmpeg" >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  echo "Usage : $0 <master.mp4:derniereImageScrub:derniereImageBoucle> ..." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# Un seek fluide suppose que TOUTES les images de la plage scrubee sont des
# images cles. Mieux vaut le verifier que le decouvrir sur Safari.
verify() {
  local file="$1" scrub_end="$2"

  local counts
  counts=$(ffprobe -v error -select_streams v:0 \
    -show_entries frame=key_frame -read_intervals "%+${scrub_end}" \
    -of csv=p=0 "$file" |
    awk -F, '{total++; if ($1 == 1) keys++} END {printf "%d %d", keys + 0, total + 0}')

  local keys total
  keys=$(cut -d' ' -f1 <<<"$counts")
  total=$(cut -d' ' -f2 <<<"$counts")

  if [ "$keys" -eq "$total" ] && [ "$total" -gt 0 ]; then
    echo "     images cles : ${keys}/${total} sur la plage scrubee"
  else
    echo "     ATTENTION : ${keys}/${total} images cles seulement, le scrub sautera" >&2
  fi
}

snippet=""

for argument in "$@"; do
  input="${argument%%:*}"
  rest="${argument#*:}"
  scrub_frame="${rest%%:*}"
  end_frame="${rest##*:}"

  if [ ! -f "$input" ]; then
    echo "Fichier introuvable : $input" >&2
    exit 1
  fi

  if [ "$rest" = "$argument" ] || [ -z "$scrub_frame" ] || [ -z "$end_frame" ]; then
    echo "Decoupage manquant pour $input (attendu : fichier.mp4:166:398)" >&2
    exit 1
  fi

  rate=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate \
    -of default=nw=1:nk=1 "$input" | head -1)
  fps=$(awk -F/ '{ if ($2) print $1 / $2; else print $1 }' <<<"$rate")

  scrub_end=$(awk -v f="$scrub_frame" -v r="$fps" 'BEGIN { printf "%.4f", f / r }')
  duration=$(awk -v f="$end_frame" -v r="$fps" 'BEGIN { printf "%.4f", f / r }')

  name=$(basename "$input")
  name="${name%.*}"

  kept=$((scrub_frame / SCRUB_DIVISOR))
  density=$(awk -v h="$SCROLL_HEIGHT" -v f="$kept" 'BEGIN { printf "%.1f", h / f }')

  echo "== ${name}  (${fps} fps)"
  echo "   scrub  : images 0-${scrub_frame}  →  0 → ${scrub_end} s"
  echo "   boucle : images ${scrub_frame}-${end_frame}  →  ${scrub_end} → ${duration} s"
  echo "   densite: ${kept} images sur ${SCROLL_HEIGHT} px de scroll, soit ${density} px par image"

  if awk -v d="$density" 'BEGIN { exit !(d > 20) }'; then
    echo "   ATTENTION : au-dela de 20 px par image, le scrub se verra par a-coups" >&2
  fi

  for width in $WIDTHS; do
    output="${OUT_DIR}/${name}-${width}.mp4"

    # La decimation ne s'applique qu'avant `scrub_end` ; `passthrough` preserve
    # les timestamps d'origine, sans quoi les bornes ne correspondraient plus.
    filters="scale=${width}:-2:flags=lanczos"
    if [ "$SCRUB_DIVISOR" -gt 1 ]; then
      filters="select='if(lt(t\,${scrub_end})\,not(mod(n\,${SCRUB_DIVISOR}))\,1)',${filters}"
    fi

    ffmpeg -hide_banner -loglevel error -y -i "$input" \
      -ss 0 -to "$duration" \
      -vf "$filters" -fps_mode passthrough \
      -c:v libx264 -crf "$CRF" -preset slow \
      -force_key_frames "expr:lte(t,${scrub_end})" \
      -g 60 -x264-params scenecut=0 \
      -pix_fmt yuv420p -profile:v high -level 4.1 \
      -movflags +faststart -an \
      "$output"

    ffmpeg -hide_banner -loglevel error -y -ss 0 -i "$input" \
      -frames:v 1 -vf "scale=${width}:-2:flags=lanczos" -q:v 3 \
      "${OUT_DIR}/${name}-${width}-poster.jpg"

    echo "   ${output}  ($(du -h "$output" | cut -f1))"
    verify "$output" "$scrub_end"
  done

  snippet="${snippet}<video data-vb-video=\"${name}\" data-vb-file=\"${name}\" data-vb-transition=\"${scrub_frame}\" data-vb-end=\"${end_frame}\"></video>\n"
done

echo
echo "Total : $(du -sh "$OUT_DIR" | cut -f1) dans ${OUT_DIR}"
echo
echo "Attributs a poser sur chaque balise video :"
printf "%b" "$snippet"
