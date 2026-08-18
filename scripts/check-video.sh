#!/usr/bin/env bash
#
# Controle qu'une video tient les standards du scrub au scroll.
#
# Deux usages, l'outil devine lequel :
#
#   ./scripts/check-video.sh masters/video3.mp4:166:398   avant encodage
#   ./scripts/check-video.sh public/assets                apres encodage
#
# Avant encodage, il verifie ce qu'un master doit apporter (cadence constante,
# definition suffisante, plage scrubee assez dense) et imprime la ligne
# `encode.sh` et les attributs `<video>` correspondants.
#
# Apres encodage, il verifie ce que le navigateur exigera du fichier servi :
# plage all-intra, `moov` en tete, yuv420p, jeu de largeurs complet, posters.
#
# Les standards ne sont pas recopies ici : la cadence et les largeurs sont
# lues dans src/config.js, seule source de verite du lecteur.
#
# Reglages (variables d'environnement) :
#   SCROLL_HEIGHT=2250        hauteur de scroll utile, pour la densite d'images
#   MAX_PX_PER_FRAME=20       au-dela, le scrub se voit par a-coups
#   MB_PER_1000PX=4           budget de poids, proportionnel a la largeur
#   MIN_LOOP_FRAMES=30        boucle plus courte = battement visible
#
# Sort en erreur des qu'un ECHEC est releve : utilisable en garde-fou avant
# `pnpm upload`.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${ROOT}/src/config.js"

SCROLL_HEIGHT="${SCROLL_HEIGHT:-2250}"
MAX_PX_PER_FRAME="${MAX_PX_PER_FRAME:-20}"
MB_PER_1000PX="${MB_PER_1000PX:-4}"
MIN_LOOP_FRAMES="${MIN_LOOP_FRAMES:-30}"

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe est introuvable. Installation : brew install ffmpeg" >&2
  exit 1
fi

# Les standards viennent de la config du lecteur, pas d'une copie locale.
CONFIG_FPS=$(sed -n 's/^[[:space:]]*fps:[[:space:]]*\([0-9.]*\).*/\1/p' "$CONFIG_FILE" | head -1)
CONFIG_FPS="${CONFIG_FPS:-30}"
CONFIG_WIDTHS=$(sed -n 's/^[[:space:]]*widths:[[:space:]]*\[\([^]]*\)\].*/\1/p' "$CONFIG_FILE" | head -1 |
  tr -d ' ' | tr ',' ' ')
CONFIG_WIDTHS="${CONFIG_WIDTHS:-750 1280 1920}"

failures=0
warnings=0

ok() { echo "  OK        $1"; }
warn() {
  echo "  ATTENTION $1" >&2
  warnings=$((warnings + 1))
}
fail() {
  echo "  ECHEC     $1" >&2
  failures=$((failures + 1))
}
info() { echo "  ..        $1"; }

field() {
  ffprobe -v error -select_streams "${3:-v:0}" -show_entries "$2" -of default=nw=1:nk=1 "$1" 2>/dev/null | head -1
}

# Cadence reelle, en decimal. Une fraction 30000/1001 vaut 29.97.
rate_of() {
  awk -F/ '{ if ($2) printf "%.4f", $1 / $2; else printf "%.4f", $1 }' <<<"$1"
}

close_enough() {
  awk -v a="$1" -v b="$2" -v t="${3:-0.01}" 'BEGIN { exit !(a - b < t && b - a < t) }'
}

frame_count() {
  local count
  count=$(field "$1" stream=nb_frames)
  if [ -z "$count" ] || [ "$count" = "N/A" ]; then
    count=$(ffprobe -v error -select_streams v:0 -count_frames \
      -show_entries stream=nb_read_frames -of default=nw=1:nk=1 "$1" | head -1)
  fi
  echo "${count:-0}"
}

# ---------------------------------------------------------------- master ----

master_fps=""
master_geometry=""

check_master() {
  local argument="$1"
  local input="${argument%%:*}"
  local rest="" scrub_frame="" end_frame=""

  if [ "$argument" != "$input" ]; then
    rest="${argument#*:}"
    scrub_frame="${rest%%:*}"
    end_frame="${rest##*:}"
    [ "$end_frame" = "$scrub_frame" ] && end_frame=""
  fi

  echo "== $(basename "$input")  (master)"

  local before="$failures"

  if [ ! -f "$input" ]; then
    fail "fichier introuvable : $input"
    return
  fi

  local codec width height pix_fmt rate avg fps frames duration audio rotation
  codec=$(field "$input" stream=codec_name)
  width=$(field "$input" stream=width)
  height=$(field "$input" stream=height)
  pix_fmt=$(field "$input" stream=pix_fmt)
  rate=$(field "$input" stream=r_frame_rate)
  avg=$(field "$input" stream=avg_frame_rate)
  duration=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$input")
  audio=$(field "$input" stream=codec_name a:0)
  rotation=$(field "$input" side_data=rotation)

  if [ -z "$codec" ]; then
    fail "aucun flux video lisible"
    return
  fi

  fps=$(rate_of "$rate")
  frames=$(frame_count "$input")

  info "${codec} ${width}x${height} ${pix_fmt} ${fps} fps ${frames} images $(du -h "$input" | cut -f1)"

  # Cadence constante : le decoupage se declare en numeros d'image, une cadence
  # variable ferait deriver la conversion image -> seconde tout au long du scrub.
  if close_enough "$fps" "$(rate_of "$avg")" 0.02; then
    ok "cadence constante"
  else
    fail "cadence variable ($(rate_of "$avg") en moyenne pour ${fps} nominal) — reencoder le master en CFR"
  fi

  if close_enough "$fps" "$CONFIG_FPS" 0.02; then
    ok "cadence ${fps} fps, celle attendue par src/config.js"
  else
    warn "cadence ${fps} fps alors que src/config.js annonce ${CONFIG_FPS} — poser data-vb-fps=\"${fps%.0000}\" sur la balise"
  fi

  # La plus grande largeur encodee ne doit jamais etre un agrandissement.
  local widest=0
  for candidate in $CONFIG_WIDTHS; do
    [ "$candidate" -gt "$widest" ] && widest="$candidate"
  done

  if [ "${width:-0}" -ge "$widest" ]; then
    ok "definition ${width}px, suffisante pour la largeur ${widest}"
  else
    fail "definition ${width}px inferieure a la plus grande largeur encodee (${widest}) — l'encodage agrandirait"
  fi

  local aspect
  aspect=$(awk -v w="${width:-0}" -v h="${height:-1}" 'BEGIN { printf "%.3f", w / h }')
  if awk -v a="$aspect" 'BEGIN { exit !(a >= 1.7) }'; then
    ok "format ${aspect}:1, le plein ecran recadre sans manquer d'image"
  else
    warn "format ${aspect}:1 plus etroit que 16/9 — object-fit: cover rognera fortement sur les ecrans larges"
  fi

  case "$pix_fmt" in
    yuv420p | yuv420p10le | yuvj420p) ok "sous-echantillonnage 4:2:0" ;;
    *) warn "pix_fmt ${pix_fmt} — l'encodage forcera yuv420p, verifier le rendu des aplats" ;;
  esac

  if [ -n "$rotation" ] && [ "$rotation" != "0" ]; then
    fail "rotation ${rotation}° dans les metadonnees — la degauchir avant encodage, le stage ne la lit pas"
  else
    ok "aucune rotation en metadonnees"
  fi

  [ -n "$audio" ] && info "piste audio ${audio} presente, l'encodage la retirera (-an)"

  if [ -z "$scrub_frame" ]; then
    local minimum
    minimum=$(awk -v h="$SCROLL_HEIGHT" -v p="$MAX_PX_PER_FRAME" 'BEGIN { printf "%d", h / p + 0.999 }')
    info "decoupage non fourni — l'ajouter pour le controle de densite : $(basename "$input"):<scrub>:<fin>"
    info "il faut au moins ${minimum} images de scrub pour tenir ${MAX_PX_PER_FRAME} px par image"
  else
    check_cut "$input" "$scrub_frame" "$end_frame" "$frames" "$fps"
  fi

  # Les videos s'echangent a chaud : une geometrie ou une cadence differente
  # se verrait au moment de la bascule.
  local geometry="${width}x${height}"
  if [ -z "$master_geometry" ]; then
    master_geometry="$geometry"
    master_fps="$fps"
  else
    [ "$geometry" = "$master_geometry" ] ||
      fail "geometrie ${geometry} differente du premier master (${master_geometry}) — la bascule a chaud sauterait"
    close_enough "$fps" "$master_fps" 0.02 ||
      warn "cadence ${fps} differente du premier master (${master_fps})"
  fi

  local snippet_end=""
  [ -n "$end_frame" ] && snippet_end=" data-vb-end=\"${end_frame}\""
  local name
  name=$(basename "$input")
  name="${name%.*}"

  # La ligne d'encodage ne se propose que sur un master reellement conforme.
  if [ -n "$scrub_frame" ] && [ "$failures" -eq "$before" ]; then
    echo "  → ./scripts/encode.sh ${input}:${scrub_frame}:${end_frame:-$frames}"
    echo "  → <video data-vb-video=\"${name}\" data-vb-file=\"${name}\" data-vb-transition=\"${scrub_frame}\"${snippet_end}></video>"
  fi
  echo
}

# Densite d'images sur la plage scrubee, et longueur de la boucle.
check_cut() {
  local input="$1" scrub_frame="$2" end_frame="$3" frames="$4" fps="$5"

  if [ "$frames" -gt 0 ] && [ "$scrub_frame" -gt "$frames" ]; then
    fail "image de transition ${scrub_frame} au-dela des ${frames} images du fichier"
    return
  fi

  if [ -n "$end_frame" ] && [ "$frames" -gt 0 ] && [ "$end_frame" -gt "$frames" ]; then
    fail "derniere image ${end_frame} au-dela des ${frames} images du fichier"
    return
  fi

  local density
  density=$(awk -v h="$SCROLL_HEIGHT" -v f="$scrub_frame" 'BEGIN { printf "%.1f", h / f }')

  if awk -v d="$density" -v m="$MAX_PX_PER_FRAME" 'BEGIN { exit !(d <= m) }'; then
    ok "densite ${density} px de scroll par image sur ${scrub_frame} images"
  else
    local needed
    needed=$(awk -v h="$SCROLL_HEIGHT" -v p="$MAX_PX_PER_FRAME" 'BEGIN { printf "%d", h / p + 0.999 }')
    fail "densite ${density} px par image (max ${MAX_PX_PER_FRAME}) — allonger la plage scrubee a ${needed} images, ou reduire la hauteur de la section 1"
  fi

  # Une plage scrubee assez dense pour etre decimee economise pres de 40 % du poids.
  local halved
  halved=$(awk -v h="$SCROLL_HEIGHT" -v f="$scrub_frame" 'BEGIN { printf "%.1f", h / (int(f / 2)) }')
  if awk -v d="$halved" -v m="$MAX_PX_PER_FRAME" 'BEGIN { exit !(d <= m) }'; then
    info "SCRUB_DIVISOR=2 tiendrait encore (${halved} px par image) et allegerait le fichier d'environ 40 %"
  fi

  if [ -n "$end_frame" ]; then
    local loop_frames
    loop_frames=$((end_frame - scrub_frame))
    if [ "$loop_frames" -ge "$MIN_LOOP_FRAMES" ]; then
      ok "boucle de ${loop_frames} images ($(awk -v f="$loop_frames" -v r="$fps" 'BEGIN { printf "%.1f", f / r }') s)"
    else
      warn "boucle de ${loop_frames} images seulement — le retour au debut battra a chaque tour"
    fi
  fi
}

# --------------------------------------------------------------- encodes ----

check_encoded() {
  local input="$1"

  echo "== $(basename "$input")  (encode)"

  if [ ! -f "$input" ]; then
    fail "fichier introuvable : $input"
    return
  fi

  local base name declared_width
  base=$(basename "$input" .mp4)
  name="${base%-*}"
  declared_width="${base##*-}"

  local codec width height pix_fmt profile level rate audio
  codec=$(field "$input" stream=codec_name)
  width=$(field "$input" stream=width)
  height=$(field "$input" stream=height)
  pix_fmt=$(field "$input" stream=pix_fmt)
  profile=$(field "$input" stream=profile)
  level=$(field "$input" stream=level)
  rate=$(field "$input" stream=r_frame_rate)
  audio=$(field "$input" stream=codec_name a:0)

  local bytes
  bytes=$(wc -c <"$input" | tr -d ' ')

  info "${codec} ${width}x${height} ${pix_fmt} ${profile} level ${level} $(du -h "$input" | cut -f1)"

  [ "$codec" = "h264" ] || fail "codec ${codec} — h264 est le seul universellement scrubable"

  if [[ "$declared_width" =~ ^[0-9]+$ ]] && [ "$declared_width" != "$width" ]; then
    fail "le nom annonce ${declared_width}px, le fichier fait ${width}px"
  fi

  if [ $((width % 2)) -eq 0 ] && [ $((height % 2)) -eq 0 ]; then
    ok "dimensions paires"
  else
    fail "dimensions impaires ${width}x${height} — yuv420p exige des multiples de 2"
  fi

  [ "$pix_fmt" = "yuv420p" ] || fail "pix_fmt ${pix_fmt} — Safari ne decode que yuv420p 8 bits en <video>"
  [ -z "$audio" ] || fail "piste audio presente — elle empeche l'autoplay et alourdit pour rien (-an)"

  if [ -n "$level" ] && [ "$level" -le 41 ]; then
    ok "level ${level}, dans ce que decodent les appareils anciens"
  else
    warn "level ${level} au-dela de 4.1 — risque de refus sur mobile"
  fi

  check_faststart "$input"
  check_all_intra "$input" "$(rate_of "$rate")"

  local budget
  budget=$(awk -v w="$width" -v r="$MB_PER_1000PX" 'BEGIN { printf "%.1f", w * r / 1000 }')
  local megabytes
  megabytes=$(awk -v b="$bytes" 'BEGIN { printf "%.1f", b / 1048576 }')

  if awk -v m="$megabytes" -v b="$budget" 'BEGIN { exit !(m <= b) }'; then
    ok "poids ${megabytes} Mo, sous le budget de ${budget} Mo"
  else
    warn "poids ${megabytes} Mo au-dela du budget de ${budget} Mo — restreindre la plage all-intra (fournir le decoupage), ou monter CRF"
  fi

  local poster
  poster="$(dirname "$input")/${base}-poster.jpg"
  if [ -f "$poster" ]; then
    ok "poster present ($(du -h "$poster" | cut -f1))"
  else
    fail "poster manquant : ${poster} — c'est le repli prefers-reduced-motion"
  fi

  echo
}

# `moov` avant `mdat` : sans quoi le lecteur telecharge la fin du fichier avant
# de pouvoir seeker, et le premier scrub reste fige.
check_faststart() {
  local input="$1" moov mdat
  moov=$(LC_ALL=C grep -abo -m1 moov "$input" | cut -d: -f1 || true)
  mdat=$(LC_ALL=C grep -abo -m1 mdat "$input" | cut -d: -f1 || true)

  if [ -z "$moov" ] || [ -z "$mdat" ]; then
    warn "atomes moov/mdat introuvables, faststart inverifiable"
  elif [ "$moov" -lt "$mdat" ]; then
    ok "moov en tete de fichier (faststart)"
  else
    fail "moov apres mdat — reencoder avec -movflags +faststart, sinon le seek attend tout le fichier"
  fi
}

# Toutes les images de la plage scrubee doivent etre des images cles. La plage
# se deduit du fichier : c'est la serie d'images cles consecutives en tete.
check_all_intra() {
  local input="$1" fps="$2"

  local measured
  measured=$(ffprobe -v error -select_streams v:0 \
    -show_entries frame=key_frame,best_effort_timestamp_time -of csv=p=0 "$input" |
    awk -F, '
      { total++ }
      $1 == 1 { keys++ }
      $1 == 1 && !broken { run++ }
      $1 != 1 && !broken { broken = 1; cut = $2 }
      END { printf "%d %d %d %s", run + 0, keys + 0, total + 0, (cut == "" ? "fin" : cut) }')

  local run keys total cut
  read -r run keys total cut <<<"$measured"

  if [ "$total" -eq 0 ]; then
    fail "aucune image lisible"
    return
  fi

  if [ "$run" -le 1 ]; then
    fail "aucune plage all-intra (${keys}/${total} images cles) — reencoder avec encode.sh, le scrub sautera de GOP en GOP"
    return
  fi

  local seconds
  if [ "$cut" = "fin" ]; then
    seconds=$(awk -v f="$total" -v r="$fps" 'BEGIN { printf "%.2f", f / r }')
    ok "fichier entierement all-intra (${total} images, ${seconds} s)"
  else
    ok "plage all-intra : ${run} images, soit 0 → $(printf '%.2f' "$cut") s"
    info "data-vb-transition doit tomber dans cette plage, au plus tard a l'image ${run}"
  fi

  local minimum
  minimum=$(awk -v h="$SCROLL_HEIGHT" -v p="$MAX_PX_PER_FRAME" 'BEGIN { printf "%d", h / p + 0.999 }')
  if [ "$run" -lt "$minimum" ]; then
    warn "${run} images scrubables pour ${SCROLL_HEIGHT} px de scroll, soit $(awk -v h="$SCROLL_HEIGHT" -v f="$run" 'BEGIN { printf "%.1f", h / f }') px par image"
  fi
}

# Le lecteur demande une largeur precise : un jeu incomplet donne un 404.
check_set() {
  local directory="$1"
  local names
  names=$(find "$directory" -maxdepth 1 -name '*.mp4' -exec basename {} .mp4 \; |
    sed 's/-[0-9]*$//' | sort -u)

  [ -n "$names" ] || return 0

  echo "== jeu de largeurs  (${directory})"
  for name in $names; do
    local missing=""
    for width in $CONFIG_WIDTHS; do
      [ -f "${directory}/${name}-${width}.mp4" ] || missing="${missing} ${width}"
    done
    if [ -z "$missing" ]; then
      ok "${name} : $(tr ' ' ',' <<<"$CONFIG_WIDTHS" | sed 's/,$//')"
    else
      fail "${name} : largeurs manquantes${missing} — WIDTHS de src/config.js"
    fi
  done
  echo
}

# ------------------------------------------------------------------ main ----

mode=""

while [ "$#" -gt 0 ] && [[ "$1" == --* ]]; do
  case "$1" in
    --master) mode="master" ;;
    --encoded) mode="encoded" ;;
    *)
      echo "Option inconnue : $1" >&2
      exit 1
      ;;
  esac
  shift
done

if [ "$#" -eq 0 ]; then
  cat >&2 <<USAGE
Usage :
  $0 masters/video3.mp4:166:398    controle un master avant encodage
  $0 public/assets                 controle des fichiers encodes
  $0 --master|--encoded <fichier>  force le mode
USAGE
  exit 1
fi

echo "Standards lus dans src/config.js : ${CONFIG_FPS} fps, largeurs $(tr ' ' ',' <<<"$CONFIG_WIDTHS" | sed 's/,$//')"
echo

for argument in "$@"; do
  path="${argument%%:*}"

  if [ -d "$path" ]; then
    check_set "$path"
    for file in "$path"/*.mp4; do
      [ -f "$file" ] || continue
      check_encoded "$file"
    done
    continue
  fi

  case "$mode" in
    master) check_master "$argument" ;;
    encoded) check_encoded "$path" ;;
    *)
      # Un fichier nomme `<nom>-<largeur>.mp4` est un encode, sinon un master.
      if [[ "$(basename "$path")" =~ -[0-9]+\.mp4$ ]]; then
        check_encoded "$path"
      else
        check_master "$argument"
      fi
      ;;
  esac
done

if [ "$failures" -gt 0 ]; then
  echo "${failures} echec(s), ${warnings} avertissement(s)." >&2
  exit 1
fi

if [ "$warnings" -gt 0 ]; then
  echo "Aucun echec, ${warnings} avertissement(s)."
else
  echo "Tout est conforme."
fi
