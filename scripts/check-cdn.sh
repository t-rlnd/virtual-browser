#!/usr/bin/env bash
#
# Verifie qu'une URL de MP4 remplit les trois conditions du scrub :
#   1. requetes Range servies, sinon le seek telecharge tout le fichier
#   2. en-tetes CORS ouverts, sinon la migration vers le rendu canvas sera bloquee
#   3. fichier brut et non un manifeste HLS, qui rendrait le currentTime imprecis
#
# Usage : ./scripts/check-cdn.sh https://ma-zone.b-cdn.net/scroll-video/v1/video1-1280.mp4

set -euo pipefail

URL="${1:?Usage : $0 <url>}"

headers=$(curl --silent --show-error --location --head \
  -H "Origin: https://example.com" \
  -H "Range: bytes=0-1023" \
  "$URL")

echo "$headers"
echo "---"

check() {
  local label="$1" pattern="$2" advice="$3"

  if grep -qi "$pattern" <<<"$headers"; then
    echo "OK    ${label}"
  else
    echo "ECHEC ${label} — ${advice}"
  fi
}

check "requetes Range" '^HTTP/.* 206\|accept-ranges: *bytes' \
  "activer le support des Range sur la Pull Zone"

check "CORS" 'access-control-allow-origin' \
  "ajouter Access-Control-Allow-Origin: * dans les en-tetes de la Pull Zone"

check "type MIME video" 'content-type: *video/mp4' \
  "le fichier n'est pas servi en video/mp4, verifier le Content-Type au televersement"

if grep -qi 'content-type: *application/\(vnd.apple.mpegurl\|x-mpegurl\|dash\)' <<<"$headers"; then
  echo "ECHEC flux adaptatif detecte — servir le MP4 brut, pas de Bunny Stream ni Cloudflare Stream"
fi
