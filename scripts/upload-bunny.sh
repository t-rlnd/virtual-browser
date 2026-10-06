#!/usr/bin/env bash
#
# Televerse un ou plusieurs dossiers d'export (sortis de export.sh) vers la
# Storage Zone Bunny, a plat, sous le prefixe que le lecteur attend.
#
# Usage :
#   export BUNNY_STORAGE_ZONE=virtual-browser
#   export BUNNY_STORAGE_KEY=xxxxxxxx           # mot de passe FTP/API de la zone
#   ./scripts/upload-bunny.sh exports/video3 [exports/hero ...]
#
# Le prefixe distant (`home/v1`) et l'hote de la Pull Zone sont lus dans
# `base` de src/config.js : ce que le script depose est exactement ce que le
# lecteur demandera. Pour publier une nouvelle serie de videos sans purger
# le cache, changer `base` (v1 -> v2), rebuild, puis relancer ce script.
#
# Reglages optionnels :
#   BUNNY_HOST=storage.bunnycdn.com   ny. / la. / sg. / uk. / se. selon la region de la zone
#   REMOTE_PREFIX=home/v1             forcer un autre prefixe que celui de src/config.js
#
# Bunny ne porte que les medias : le bundle JS/CSS est servi par Cloudflare
# depuis dist/ (voir docs/hosting.md).

set -euo pipefail

: "${BUNNY_STORAGE_ZONE:?BUNNY_STORAGE_ZONE doit etre defini}"
: "${BUNNY_STORAGE_KEY:?BUNNY_STORAGE_KEY doit etre defini}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${ROOT}/src/config.js"

BUNNY_HOST="${BUNNY_HOST:-storage.bunnycdn.com}"

# `base: 'https://virtual-browser.b-cdn.net/home/v1'` -> hote + prefixe.
BASE=$(sed -n "s/^[[:space:]]*base:[[:space:]]*'\([^']*\)'.*/\1/p" "$CONFIG_FILE" | head -1)
BASE="${BASE%/}"
CDN_HOST="${BASE#*://}"
CDN_HOST="${CDN_HOST%%/*}"
REMOTE_PREFIX="${REMOTE_PREFIX:-${BASE#*://*/}}"

if [ "$#" -eq 0 ]; then
  echo "Usage : $0 exports/video3 [exports/hero ...]" >&2
  exit 1
fi

content_type() {
  case "$1" in
    *.mp4) echo "video/mp4" ;;
    *.jpg | *.jpeg) echo "image/jpeg" ;;
    *) echo "application/octet-stream" ;;
  esac
}

put() {
  local file="$1"
  local remote="${REMOTE_PREFIX}/$(basename "$file")"

  curl --fail --silent --show-error \
    -X PUT "https://${BUNNY_HOST}/${BUNNY_STORAGE_ZONE}/${remote}" \
    -H "AccessKey: ${BUNNY_STORAGE_KEY}" \
    -H "Content-Type: $(content_type "$file")" \
    --data-binary "@${file}"

  echo "  -> ${remote}  ($(du -h "$file" | cut -f1))"
}

uploaded=0
first=""

for directory in "$@"; do
  if [ ! -d "$directory" ]; then
    echo "Dossier introuvable : $directory (lancer d'abord ./scripts/export.sh)" >&2
    exit 1
  fi
  for file in "$directory"/*.mp4 "$directory"/*.jpg; do
    [ -f "$file" ] || continue
    put "$file"
    uploaded=$((uploaded + 1))
    [ -n "$first" ] || first=$(basename "$file")
  done
done

if [ "$uploaded" -eq 0 ]; then
  echo "Rien a televerser : aucun .mp4 ni .jpg dans $*" >&2
  exit 1
fi

echo
echo "${uploaded} fichiers televerses sous ${REMOTE_PREFIX}/"
echo "Verifier que la Pull Zone sert bien du MP4 brut, avec Range et CORS :"
echo "  ./scripts/check-cdn.sh https://${CDN_HOST}/${REMOTE_PREFIX}/${first}"
