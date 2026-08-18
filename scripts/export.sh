#!/usr/bin/env bash
#
# Prepare une video pour Bunny, en une commande.
#
#   ./scripts/export.sh masters/video3.mp4
#
# Sort un dossier `exports/video3/` contenant toutes les largeurs et leurs
# posters, controle, pret a etre depose tel quel dans la Storage Zone. Aucun
# reglage a connaitre : le decoupage est optionnel, les largeurs viennent de
# src/config.js.
#
# Le decoupage se passe comme a encode.sh quand on le connait :
#
#   ./scripts/export.sh masters/video3.mp4:166:398
#
# Sans lui, le fichier sort **entierement all-intra** : chaque image devient
# une image cle, donc n'importe quel `data-vb-transition` fonctionnera sans
# reencoder. C'est le choix confortable, paye en poids : mesure a trois fois
# le fichier decoupe. Une fois le point de bascule arrete, relancer avec le
# decoupage pour revenir au poids normal.
#
# Reglages (variables d'environnement) :
#   OUT_ROOT=exports   dossier ou sont crees les exports
#   WIDTHS="..."       par defaut, les largeurs de src/config.js
#   CRF=24             qualite (plus bas = meilleur et plus lourd)
#
# Ce script n'encode pas lui-meme : il enchaine check-video.sh, encode.sh, puis
# check-video.sh a nouveau sur le resultat. Il refuse d'encoder un master qui
# ne tient pas les standards.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${ROOT}/src/config.js"

OUT_ROOT="${OUT_ROOT:-${ROOT}/exports}"
CRF="${CRF:-24}"
REMOTE_PREFIX="${REMOTE_PREFIX:-scroll-video/v1}"

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffmpeg est introuvable. Installation : brew install ffmpeg" >&2
  exit 1
fi

# Les largeurs restent celles que le lecteur demandera. En changer ici sans le
# faire dans src/config.js produirait des 404.
if [ -z "${WIDTHS:-}" ]; then
  WIDTHS=$(sed -n 's/^[[:space:]]*widths:[[:space:]]*\[\([^]]*\)\].*/\1/p' "$CONFIG_FILE" | head -1 |
    tr -d ' ' | tr ',' ' ')
  WIDTHS="${WIDTHS:-750 1280 1920}"
fi

if [ "$#" -eq 0 ]; then
  cat >&2 <<USAGE
Usage :
  $0 <video.mp4>                    tout all-intra, decoupage libre ensuite
  $0 <video.mp4:transition:fin>     decoupage connu, fichier allege
USAGE
  exit 1
fi

snippets=""

for argument in "$@"; do
  input="${argument%%:*}"
  cut=""
  [ "$argument" != "$input" ] && cut="${argument#*:}"

  if [ ! -f "$input" ]; then
    echo "Fichier introuvable : $input" >&2
    exit 1
  fi

  name=$(basename "$input")
  name="${name%.*}"
  out="${OUT_ROOT}/${name}"

  echo "════ ${name}"
  echo

  # 1. Le master tient-il les standards. Un ECHEC arrete tout : encoder un
  #    master hors standards ne ferait que propager le probleme.
  echo "── controle du master"
  if ! "${ROOT}/scripts/check-video.sh" --master "$argument"; then
    echo "Master hors standards, rien n'a ete encode." >&2
    exit 1
  fi

  # 2. Sans decoupage, tout le fichier passe en all-intra : on borne sur le
  #    nombre reel d'images, ce qu'encode.sh attend en argument.
  if [ -z "$cut" ]; then
    frames=$(ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames \
      -of default=nw=1:nk=1 "$input" | head -1)
    if [ -z "$frames" ] || [ "$frames" = "N/A" ]; then
      frames=$(ffprobe -v error -select_streams v:0 -count_frames \
        -show_entries stream=nb_read_frames -of default=nw=1:nk=1 "$input" | head -1)
    fi
    cut="${frames}:${frames}"
    echo "── encodage all-intra sur les ${frames} images (aucun decoupage fourni)"
  else
    echo "── encodage, decoupage ${cut}"
  fi

  rm -rf "$out"
  mkdir -p "$out"

  WIDTHS="$WIDTHS" CRF="$CRF" OUT_DIR="$out" \
    "${ROOT}/scripts/encode.sh" "${input}:${cut}"

  # 3. Ce qui va etre televerse est-il servable.
  echo
  echo "── controle de l'export"
  "${ROOT}/scripts/check-video.sh" "$out"

  echo "── ${name} : $(du -sh "$out" | cut -f1) dans ${out}"
  ls -1 "$out" | sed 's/^/     /'
  echo

  transition="${cut%%:*}"
  end="${cut##*:}"
  if [ "$transition" = "$end" ]; then
    snippets="${snippets}<video data-vb-video=\"${name}\" data-vb-file=\"${name}\" data-vb-transition=\"A_CHOISIR\"></video>\n"
  else
    snippets="${snippets}<video data-vb-video=\"${name}\" data-vb-file=\"${name}\" data-vb-transition=\"${transition}\" data-vb-end=\"${end}\"></video>\n"
  fi
done

# --------------------------------------------------------------- recap ------

echo "════ a faire ensuite"
echo
echo "1. Deposer le contenu des dossiers ci-dessous dans la Storage Zone Bunny,"
echo "   sous ${REMOTE_PREFIX}/ — a plat, les fichiers cote a cote :"
echo
for argument in "$@"; do
  input="${argument%%:*}"
  name=$(basename "$input")
  echo "     ${OUT_ROOT}/${name%.*}"
done
echo
command -v open >/dev/null 2>&1 && echo "   open \"${OUT_ROOT}\""
echo
echo "2. Verifier que le CDN sert bien du MP4 brut :"
first=$(basename "${1%%:*}")
first="${first%.*}"
largest=0
for width in $WIDTHS; do [ "$width" -gt "$largest" ] && largest="$width"; done
echo "     ./scripts/check-cdn.sh https://VOTRE-ZONE.b-cdn.net/${REMOTE_PREFIX}/${first}-${largest}.mp4"
echo
echo "3. Poser ces attributs sur les balises, dans le Designer Webflow :"
echo
printf "%b" "$snippets" | sed 's/^/     /'
echo
echo "Les noms de fichiers sont un contrat : le lecteur construit ses URL a"
echo "partir de src/config.js (largeurs $(tr ' ' ',' <<<"$WIDTHS" | sed 's/,$//')). Renommer un fichier le rend introuvable."
