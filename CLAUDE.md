# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Ce que c'est

Fond video pilote au scroll pour Webflow (pas de framework, JS vanilla + GSAP
ScrollTrigger). Un unique fond video traverse deux sections superposees dans
un meme conteneur colle : scrub par le scroll sur la premiere, boucle en
autonomie (4 tours puis le use-case suivant) sur la seconde, avec bascule
manuelle et pause/lecture a tout moment. Le scroll n'ecrit qu'une progression 0→1
(`--vb-scrub`) et tout — timecode video, position du cadre, apparition des
calques — en decoule.

Lire [`docs/architecture.md`](docs/architecture.md) avant de toucher a `src/` :
il explique *qui fait quoi*. Le README explique *ce que fait* l'animation.

## Commandes

```bash
pnpm install
pnpm dev                  # esbuild en watch + serveur local sur http://localhost:3000
pnpm build                # build de production -> dist/ (verse dans git, publie par Cloudflare)

pnpm test                 # attributs data-vb-* et machine a etats, sans navigateur
pnpm test:e2e             # parcours complet sur virtual-browser.webflow.io, bundle dev/ injecte
BROWSER=webkit pnpm test:e2e   # moteur de rendu ; webkit = risque du scrub (decodeur Safari)

pnpm build && pnpm test:bundle  # meme parcours avec dist/ (dernier filet avant push)
BUNDLE=prod pnpm test:e2e       # le bundle reellement en ligne, sans interception
```

Pas de page HTML dans ce depot : le HTML vit dans Webflow, le depot ne
livre que la surcouche JS/CSS. Le e2e tourne donc sur le site Webflow publie
et remplace les requetes vers Cloudflare par le bundle local (`page.route`).
`pnpm test:e2e` exige `pnpm dev` lance (pour tenir `dev/` a jour). Un test
unique : `node --test test/stage.test.mjs`.

Le mode watch ecrit dans `dev/` (non versionne) ; `dist/` est le seul
artefact de build versionne.

### Scripts video (hors watch/build)

```bash
./scripts/export.sh masters/video3.mp4:166:398               # check + encode + check, sort exports/video3/
./scripts/upload-bunny.sh exports/video3                     # televerse un export sur Bunny (home/v1/)
./scripts/check-cdn.sh https://virtual-browser.b-cdn.net/home/v1/video3-1280.mp4
./scripts/check-video.sh masters/video3.mp4:166:398          # controle seul d'un master ou d'un export
```

`encode.sh` est la brique ffmpeg appelee par `export.sh`. Les scripts lisent
leurs standards (fps, largeurs, `base`) dans `src/config.js` : rien n'est
recopie. Le decoupage est en numeros d'image (`fichier.mp4:start:end`), pas
en secondes. Tout le pipeline est dans [`docs/videos.md`](docs/videos.md).

## Architecture

Flux de donnees a sens unique, jamais inverse :

```
scroll.js | compact.js -> Stage.js -> { Mp4VideoLayer.js, frame.js, progress.js, usecases.js, pause.js }
```

- **`playback.js`** — choisit le cablage : `scroll.js` au-dessus de 991 px,
  `compact.js` en dessous. Pose `data-vb-compact` sur `<html>`.
- **`scroll.js`** — cablage GSAP ScrollTrigger : traduit le scroll en
  `progress` (0→1) et en `mode`.
- **`compact.js`** — pas de scrub : progression figee a 1, boucle dans le
  cadre, pause quand `[data-vb-loop]` quitte l'ecran.
- **`Stage.js`** — machine a etats pure `{ activeId, mode, progress, paused }`.
  N'ecrit jamais dans le DOM, ne parle qu'aux couches. Les trois variables
  sont independantes (changer `activeId` ne touche ni au mode ni a la
  progression). En `loop`, compte les tours et enchaine le use-case suivant
  apres `loopRepeats` (defaut 4). `paused` fige la boucle sans toucher au
  compteur (donc gele aussi l'auto-avance) et survit aux changements de mode.
- **`layers/VideoLayer.js`** — contrat abstrait d'une couche d'image
  (`seek`, `playLoop`, `show`, `hide`). `playLoop` notifie chaque fin de
  tour via `onCycle`. `layers/Mp4VideoLayer.js` l'implemente
  avec `<video>` + MP4 (seule implementation ; un rendu `<canvas>` pourrait
  en etre une seconde).
- **`frame.js`** — sort le fond du plein ecran pour le caler sur
  `[data-vb-frame]`, pilote par `dockRange` (fonction de la progression, pas
  d'une duree).
- **`progress.js`** — publie `--vb-scrub`, `data-vb-mode`, `data-vb-active-id`
  et `data-vb-paused` sur `<html>`, et `data-vb-visible` sur chaque `[data-vb-visible-on]` ;
  `scene.css` anime intro / demo / tabs a partir de `--vb-scrub`.
- **`usecases.js`** — boutons de use-case. Ne modifie jamais l'affichage
  lui-meme : demande une bascule (`stage.setActive(...)`) et attend
  l'evenement `activechange` du Stage avant de refleter le changement. Un
  clic leve la pause avant de basculer (`setPaused(false)` puis `setActive`).
- **`pause.js`** — bouton `[data-vb-pause]` : bascule `stage.setPaused(...)`,
  reflete `aria-pressed` au retour de `pausechange`. Les icones
  `[data-vb-pause-icon]` sont choisies par `scene.css`.
- **`config.js`** — reglages globaux (`CONFIG`) + lecture des attributs
  `data-vb-*` d'une balise `<video>`. `loopRepeats` (defaut 4) borne la
  boucle avant l'auto-avance. Le decoupage par video (fichier, image de
  transition, fin de boucle) vit **sur la balise dans le DOM**, pas dans ce
  fichier — source de verite unique, ajouter un use-case ne demande aucun
  rebuild.
- **`main.js`** — point d'entree unique du bundle `index.js`, charge sur tout
  le site. `boot()` demarre Lenis, puis le Heros et Protocol independamment,
  chacun seulement si sa structure est dans la page.
- **`smooth.js`** — smooth scroll Lenis, cale sur le ticker GSAP et
  `ScrollTrigger.update`. Tout saut instantane de la page passe par
  `jumpTo()` (sinon Lenis ramene la page vers sa cible en cours). Voir ADR 0009.
- **`hero.js`** — section Heros, hors Stage : ScrollTrigger sur
  `[data-vb-hero]` → `Mp4VideoLayer.seek` + etape de texte a 1/3 et 2/3,
  bascule ligne par ligne via SplitText. Voir ADR 0007.
- **`unlock.js`** — deblocage iOS au premier geste, partage par les deux.

Trois points non evidents, commentes sur place dans le code :
`Mp4VideoLayer._drainSeek` (un seul seek en vol a la fois, sinon Safari
cesse de rendre), `Mp4VideoLayer.unlock` + `Stage.refresh` (le premier geste
iOS debloque toutes les couches sans rien restaurer lui-meme), et le drapeau
`reached` dans `scroll.js` (la section boucle est visible des le premier
pixel car superposee — sans garde-fou la boucle demarrerait avant le scrub).
Le collapse a `100dvh` une fois le verrou arme vit aussi dans `scroll.js`
(recaler `scrollY`, signal `data-vb-locked` et non `data-vb-mode`).

## Points d'attention specifiques au projet

- **Le verrou de boucle est definitif** : une fois la boucle atteinte,
  remonter ne rembobine plus rien, et la piste passe a `100dvh`
  (`data-vb-locked`). L'ancienne option `latchLoop: false` (aller-retour,
  clignement `jumpFadeMs`) a ete retiree, voir ADR 0011.
- **MP4 servis bruts, jamais via Bunny Stream / Cloudflare Stream** : le
  streaming adaptatif (HLS) rend `currentTime` imprecis et casse le scrub.
  Voir [`docs/hosting.md`](docs/hosting.md) et
  [`docs/decisions/0001-hebergement-bunny-jsdelivr.md`](docs/decisions/0001-hebergement-bunny-jsdelivr.md) (partie code remplacee par 0008 puis 0010).
- **Deux hebergeurs separes** : MP4/posters sur Bunny (hors depot), bundle
  `dist/` sur Cloudflare (`dev-vb.initweb.ai`, verse dans le depot,
  redeploye a chaque push, sans build ni tag). `wrangler.jsonc` ne publie que
  `dist/` : demo, sources et docs ne sont jamais en ligne. Toujours
  `pnpm build` + commit de `dist/` avant de pousser. Voir ADR 0010.
- **Versionner le prefixe des medias** (`home/v1/` -> `v2/`) plutot
  que purger le cache CDN, pour un deploiement atomique.
- **`crossOrigin`** sur les balises `<video>` est deliberement pose : sans
  lui, une future migration vers un rendu `<canvas>` lisant les pixels
  depuis le CDN serait teintee et illisible.
- **iOS non simule** : WebKit de bureau partage le decodeur de Safari mais
  pas ses regles d'autoplay/economie d'energie. Le deblocage au premier
  geste ne se verifie que sur un appareil reel.
- **Mode compact (< 991 px)** : plus de scrub. Les sections s'empilent
  (layout Designer), la video boucle dans `[data-vb-frame]`, pause hors
  ecran. `scene.css` force les opacites d'intro/demo/tabs a 1
  (`:root[data-vb-compact]` et `max-width: 991px`).

## Documentation interne

- `docs/architecture.md` — organisation du code (a lire avant `src/`)
- `docs/glossaire.md` — vocabulaire du projet (scrub, all-intra, sticky…)
- `docs/videos.md` — pipeline video complet : comprimer, stocker sur Bunny, servir dans Webflow
- `docs/tests.md` — tests unitaires, e2e, bundle
- `docs/webflow-setup.md` — structure a construire dans le Designer Webflow
- `docs/hosting.md` — le code sur Cloudflare, hotes ecrits en dur
- `docs/passation.md` — checklist de transfert au client (comptes, hotes en dur, masters)
- `docs/todo.md` — todo interne du projet (ouvrir via le skill `/todo`)
- `docs/decisions/` — ADR ; `docs/history/` — journal — geres via le skill `/doc-code`
