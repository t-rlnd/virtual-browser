#!/usr/bin/env bash
#
# Televerse les assets encodes vers une Storage Zone Bunny.
#
# Bunny ne porte que les medias : le bundle JS/CSS est servi depuis GitHub via
# jsDelivr, et ne passe donc pas par ici.
#
# Usage :
#   export BUNNY_STORAGE_ZONE=ma-zone
#   export BUNNY_STORAGE_KEY=xxxxxxxx        # mot de passe FTP/API de la zone
#   ./scripts/upload-bunny.sh
#
# Reglages optionnels :
#   BUNNY_HOST=storage.bunnycdn.com   ny. / la. / sg. / uk. / se. selon la region
#   REMOTE_PREFIX=scroll-video/v1     versionner ce prefixe evite tout purge de cache
#   SRC_DIR=public/assets             dossier des MP4 et posters

set -euo pipefail

: "${BUNNY_STORAGE_ZONE:?BUNNY_STORAGE_ZONE doit etre defini}"
: "${BUNNY_STORAGE_KEY:?BUNNY_STORAGE_KEY doit etre defini}"

BUNNY_HOST="${BUNNY_HOST:-storage.bunnycdn.com}"
REMOTE_PREFIX="${REMOTE_PREFIX:-scroll-video/v1}"
SRC_DIR="${SRC_DIR:-public/assets}"

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

for file in "$SRC_DIR"/*.mp4 "$SRC_DIR"/*.jpg; do
  [ -f "$file" ] || continue
  put "$file"
  uploaded=$((uploaded + 1))
done

if [ "$uploaded" -eq 0 ]; then
  echo "Rien a televerser. Lancer d'abord : npm run encode" >&2
  exit 1
fi

echo
echo "${uploaded} fichiers televerses sous ${REMOTE_PREFIX}/"
echo "Verifier ensuite que la Pull Zone sert bien du MP4 brut :"
echo "  ./scripts/check-cdn.sh https://VOTRE-ZONE.b-cdn.net/${REMOTE_PREFIX}/video1-1280.mp4"
