# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Ce que c'est

Fond video pilote au scroll pour Webflow (pas de framework, JS vanilla + GSAP
ScrollTrigger). Un unique fond video traverse deux sections superposees dans
un meme conteneur colle : scrub par le scroll sur la premiere, boucle en
autonomie sur la seconde, avec deux use-cases echangeables a chaud. Le
scroll n'ecrit qu'une progression 0→1 (`--vb-scrub`) et tout — timecode video,
position du cadre, apparition des calques — en decoule.

Lire [`docs/architecture.md`](docs/architecture.md) avant de toucher a `src/` :
il explique *qui fait quoi*. Le README explique *ce que fait* l'animation.

## Commandes

```bash
pnpm install
pnpm dev                  # esbuild en watch + serveur local sur http://localhost:3000
pnpm build                # build de production -> dist/ (verse dans git, sert via jsDelivr)

pnpm test                 # attributs data-vb-* et machine a etats, sans navigateur
pnpm test:e2e             # parcours complet sur canvas de test (DebugLayer)
REAL=1 pnpm test:e2e      # meme parcours sur les vrais MP4 encodes
BROWSER=webkit pnpm test:e2e   # moteur de rendu ; webkit = risque du scrub (decodeur Safari)

pnpm build && pnpm test:bundle  # rejoue e2e contre le bundle construit (dernier filet avant tag)
```

`pnpm test:e2e` et `test:bundle` exigent `pnpm dev` lance dans un autre
terminal. Un test unique : `node --test test/stage.test.mjs`.

En dev, ajouter `?real` a l'URL pour charger les vrais MP4 au lieu du
`DebugLayer` (canvas sans fichier video). Le mode watch ecrit dans `dev/`
(non versionne) ; `dist/` est le seul artefact de build versionne.

### Scripts video (hors watch/build)

```bash
./scripts/probe.sh masters/*.mp4                          # inspecte les masters
./scripts/check-video.sh masters/video1.mp4:166:398        # standards avant/apres encodage
./scripts/encode.sh masters/video1.mp4:166:398              # encodage ffmpeg all-intra
./scripts/export.sh masters/video3.mp4:166:398               # probe + encode + check, sort exports/
./scripts/upload-bunny.sh                                    # televerse public/assets sur Bunny
./scripts/check-cdn.sh https://zone.b-cdn.net/scroll-video/v1/video1-1280.mp4
```

`check-video.sh` lit ses standards (fps, largeurs) dans `src/config.js` : ne
recopie rien, verifie contre la config reelle. Le decoupage decoupe/end est en
numeros d'image (`fichier.mp4:start:end`), pas en secondes.

## Architecture

Flux de donnees a sens unique, jamais inverse :

```
scroll.js | compact.js -> Stage.js -> { Mp4VideoLayer.js, frame.js, progress.js, usecases.js }
```

- **`playback.js`** — choisit le cablage : `scroll.js` au-dessus de 991 px,
  `compact.js` en dessous. Pose `data-vb-compact` sur `<html>`.
- **`scroll.js`** — cablage GSAP ScrollTrigger : traduit le scroll en
  `progress` (0→1) et en `mode`.
- **`compact.js`** — pas de scrub : progression figee a 1, boucle dans le
  cadre, pause quand `[data-vb-loop]` quitte l'ecran.
- **`Stage.js`** — machine a etats pure `{ activeId, mode, progress }`.
  N'ecrit jamais dans le DOM, ne parle qu'aux couches. Les trois variables
  sont independantes (changer `activeId` ne touche ni au mode ni a la
  progression).
- **`layers/VideoLayer.js`** — contrat abstrait d'une couche d'image
  (`seek`, `playLoop`, `show`, `hide`). `layers/Mp4VideoLayer.js` l'implemente
  avec `<video>` + MP4 ; `demo/DebugLayer.js` l'implemente avec un
  `<canvas>` sans fichier video, pour prouver que le contrat tient sans
  dependre d'un decodeur video.
- **`frame.js`** — sort le fond du plein ecran pour le caler sur
  `[data-vb-frame]`, pilote par `dockRange` (fonction de la progression, pas
  d'une duree).
- **`progress.js`** — publie `--vb-scrub` et `data-vb-mode` sur `<html>` ; la
  page anime ses propres calques en CSS a partir de la.
- **`usecases.js`** — boutons de use-case. Ne modifie jamais l'affichage
  lui-meme : demande une bascule (`stage.setActive(...)`) et attend
  l'evenement `activechange` du Stage avant de refleter le changement.
- **`config.js`** — reglages globaux (`CONFIG`) + lecture des attributs
  `data-vb-*` d'une balise `<video>`. Le decoupage par video (fichier,
  image de transition, fin de boucle) vit **sur la balise dans le DOM**, pas
  dans ce fichier — source de verite unique, ajouter un use-case ne demande
  aucun rebuild.
- **`main.js`** — assemblage, garde-fous, prechargement, deblocage iOS.

Trois points non evidents, commentes sur place dans le code :
`Mp4VideoLayer._drainSeek` (un seul seek en vol a la fois, sinon Safari
cesse de rendre), `Mp4VideoLayer.unlock` + `Stage.refresh` (le premier geste
iOS debloque toutes les couches sans rien restaurer lui-meme), et le drapeau
`reached` dans `scroll.js` (la section boucle est visible des le premier
pixel car superposee — sans garde-fou la boucle demarrerait avant le scrub).

## Points d'attention specifiques au projet

- **`latchLoop: true`** (dans `src/config.js`) : une fois la boucle
  atteinte, remonter ne rembobine plus rien. `false` restaure l'aller-retour
  d'origine, ou le choix de use-case redevenait retroactif. Les deux
  comportements sont couverts par les tests.
- **MP4 servis bruts, jamais via Bunny Stream / Cloudflare Stream** : le
  streaming adaptatif (HLS) rend `currentTime` imprecis et casse le scrub.
  Voir [`docs/hosting.md`](docs/hosting.md) et
  [`docs/decisions/0001-hebergement-bunny-jsdelivr.md`](docs/decisions/0001-hebergement-bunny-jsdelivr.md).
- **Deux hebergeurs separes** : MP4/posters sur Bunny (hors depot), bundle
  `dist/` sur GitHub via jsDelivr (verse dans le depot, tague). Ne jamais
  pointer jsDelivr sur `@main` (cache 7 jours) — toujours un tag.
- **Versionner le prefixe des medias** (`scroll-video/v1/` -> `v2/`) plutot
  que purger le cache CDN, pour un deploiement atomique.
- **`crossOrigin`** sur les balises `<video>` est deliberement pose : sans
  lui, une future migration vers un rendu `<canvas>` lisant les pixels
  depuis le CDN serait teintee et illisible.
- **iOS non simule** : WebKit de bureau partage le decodeur de Safari mais
  pas ses regles d'autoplay/economie d'energie. Le deblocage au premier
  geste ne se verifie que sur un appareil reel.
- **Mode compact (< 991 px)** : plus de scrub. Les sections s'empilent
  (layout Designer), la video boucle dans `[data-vb-frame]`, pause hors
  ecran. La page doit forcer les opacites d'intro/demo a 1, `--vb-scrub`
  valant 1.

## Documentation interne

- `docs/architecture.md` — organisation du code (a lire avant `src/`)
- `docs/webflow-setup.md` — structure a construire dans le Designer Webflow
- `docs/hosting.md` — Bunny (medias) + jsDelivr (code)
- `docs/nouvelle-video.md` — a transmettre tel quel au client fournissant un master
- `docs/todo.md` — todo interne du projet (ouvrir via le skill `/todo`)
- `docs/decisions/` — ADR ; `docs/history/` — journal — geres via le skill `/doc-code`
