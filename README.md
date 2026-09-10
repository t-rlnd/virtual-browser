# Fond video pilote au scroll (Webflow)

Un unique fond video traverse deux sections **superposees** dans un meme
conteneur colle : il est **scrube par le scroll** sur la premiere, puis
**boucle en autonomie** (deux tours, puis le use-case suivant) sur la
seconde, ou un clic permet d'echanger la video avant la fin de la boucle.

Les deux sections ne se succedent pas, elles s'empilent : c'est la progression
du scrub qui fait disparaitre le titre, apparaitre les use-cases et venir la
video se caler dans son cadre. Le JavaScript n'ecrit qu'un nombre — la variable
CSS `--vb-scrub` — et la page en tire toute sa mise en scene.

Le scrub **ne joue qu'une fois** : la boucle atteinte, remonter ne
rembobine plus rien, la video reste a tourner dans son cadre (`latchLoop`,
ci-dessous).

Sous **991 px** (tablette et mobile Webflow), ce montage est coupe : les
deux sections s'empilent, la video boucle directement dans son cadre
(deux tours, puis le use-case suivant), et il n'y a plus de course de
scroll. Voir
[`docs/webflow-setup.md`](docs/webflow-setup.md#5-ter-tablette-et-mobile-sous-991-px).

> Pour reprendre le code : [`docs/architecture.md`](docs/architecture.md).
> Pour construire la page : [`docs/webflow-setup.md`](docs/webflow-setup.md).

## Le comportement en trois modes

| Mode | Quand | Ce que fait la video active |
| --- | --- | --- |
| `scrub` | Jusqu'a la fin de la course de scrub | En pause, son `currentTime` est ecrit par la position de scroll sur 00:00 → 00:03 |
| `loop` | Des que le scrub s'acheve, puis tant que la piste reste visible | Lecture autonome, 2 tours du segment 00:03 → 00:06, puis le use-case suivant ; un clic bascule tout de suite |
| `idle` | Piste entierement sortie de l'ecran | Tout en pause, rien ne se decode |

## La geometrie de la piste

Le conteneur colle faisant une hauteur d'ecran, la course d'epinglage vaut
`hauteur de piste - 100vh`. Le scrub n'en occupe pas la totalite : `loopReserve`
dans [`src/config.js`](src/config.js) reserve la fin de course a la boucle,
exprimee en hauteurs d'ecran.

```
piste 300vh
└── course 200vh
    ├── scrub    100vh   le titre s'efface, la video va de 00:00 a 00:03
    └── reserve  100vh   la video boucle dans son cadre  (loopReserve: 1)
```

Sans reserve, la boucle prendrait la main au moment ou le conteneur se decolle,
c'est-a-dire hors de vue. Pour allonger le scrub sans toucher a la boucle, il
suffit de monter la hauteur de la piste.

Une fois la boucle atteinte, la piste est ramenee a `100dvh` : le scrub deja
consomme (et la reserve) ne servent plus. Un cran vers le haut quitte la
section ; un cran vers le bas montre la suite du site. Voir
[`docs/decisions/0005-collapse-piste-apres-latch.md`](docs/decisions/0005-collapse-piste-apres-latch.md).

## Le verrou de boucle

Une fois la boucle atteinte, le scrub ne reprend plus la main : remonter vers
la section 1 laisse la video tourner dans son cadre, et la met simplement en
pause quand la section 2 quitte l'ecran. Redescendre la relance ou elle en
etait. C'est `latchLoop: true` dans [`src/config.js`](src/config.js).

Le verrou replie aussi la piste a `100dvh` (`data-vb-latched` sur `<html>`),
pour ne pas laisser 200vh de scroll mort. `latchLoop: false` restaure
l'aller-retour **et** conserve la 300vh.

Cliquer sur un use-case change uniquement **quelle** video est active : ni le
mode ni la progression ne bougent. Sans clic, la boucle s'arrete apres
`loopRepeats` tours (2 par defaut) et enchaine le use-case suivant, dans
l'ordre du DOM, puis revient au premier.

`latchLoop: false` restaure l'aller-retour d'origine — remonter rembobine la
video. C'est ce qui rendait le choix de use-case **retroactif** : apres avoir
bascule sur la video 2, la section 1 rembobinait la video 2, pas la video 1.
Le verrou rend cette retroactivite sans objet, la section 1 n'etant plus
rejouee ; les deux comportements restent couverts par les tests.

## La mise en scene, en CSS

Quelques valeurs sont publiees pour que la page anime ses propres calques :

| Publie sur | Nom | Valeur |
| --- | --- | --- |
| `<html>` | `--vb-scrub` | Progression du scrub, de 0 a 1 |
| `<html>` | `data-vb-mode` | `scrub`, `loop` ou `idle` |
| `<html>` | `data-vb-latched` | `true` une fois la boucle atteinte (collapse 100dvh) |
| `<html>` | `data-vb-current` | Use-case affiche (`v1`, `v2`, …) |
| `<html>` | `data-vb-compact` | `true` sous 991 px |
| `[data-vb-when]` | `data-vb-shown` | `true` / `false` selon que l'id courant figure dans `data-vb-when` |

Une opacite s'interpole depuis la variable ; un `pointer-events` non, d'ou
l'attribut. Un calque a opacite nulle reste cliquable : sans lui, les boutons
de use-case capteraient les clics bien avant d'etre visibles.

```css
.protocol_intro { opacity: calc(1 - var(--vb-scrub) / 0.2); }
[data-vb-loop]  { opacity: calc((var(--vb-scrub) - 0.3) / 0.3); pointer-events: none; }
:root[data-vb-mode='loop'] [data-vb-loop] { pointer-events: auto; }
```

Cards et legendes propres a un use-case portent `data-vb-when="v1"` (ou `v2`) :
le script pose `data-vb-shown`, la feuille masque les piles inactives. Voir
[`docs/webflow-setup.md`](docs/webflow-setup.md).

## Le recadrage, pilote par le scroll

Le fond ne reste plein ecran que le debut de la course. Il vient ensuite se
caler sur l'element de la section 2 portant `data-vb-frame`, et le suit tant
que la page defile.

Le mouvement est une **fonction de la progression**, pas une duree : a
mi-parcours de `dockRange` il est a mi-chemin, et remonter le defait aussi
surement qu'il l'a fait. C'est ce qui le garde solidaire du reste de la mise en
scene, elle aussi accrochee a `--vb-scrub`. La plage se regle par `dockRange`
dans [`src/config.js`](src/config.js) — `{ start: 0.05, end: 0.65 }` par defaut.

Le mouvement passe par `left/top/width/height` et non par un `transform` : la
cible n'ayant pas le format du viewport, un `scale` deformerait l'image la ou
`object-fit: cover` recadre. La geometrie est publiee en variables CSS sur le
stage (`--vb-frame-*`, plus `--vb-dock` de 0 a 1), donc toutes les couches se
recadrent ensemble et n'importe quel autre style peut s'accrocher a la
transition.

Sans `[data-vb-frame]` dans la page, rien ne change : le fond reste plein ecran
d'un bout a l'autre.

La feuille de style ne positionne ni le stage ni les sections : c'est a la page
— au Designer Webflow — de le faire. Voir
[`docs/webflow-setup.md`](docs/webflow-setup.md) pour ce qu'elle doit poser, et
pour les deux contraintes de mise en page qu'impose le cadrage.

## Demarrage

```bash
pnpm install
pnpm dev
```

esbuild passe en watch, et un serveur local sert sur
**http://localhost:3000** les fichiers **tels qu'ils seront en ligne** : sans
transformation, avec les bons types MIME et le support des requetes Range que
reclame le scrub. Chaque sauvegarde reconstruit et recharge les pages ouvertes.

La page de demonstration tourne sur **DebugLayer**, un rendu `<canvas>` qui ne
demande aucun fichier video : c'est ce qui permet de valider le scroll et la
bascule avant meme d'avoir encode les masters. Un HUD affiche l'etat en direct.

Ajouter `?real` a l'URL pour utiliser les vrais MP4.

### Developper contre le vrai site Webflow

Au demarrage, le serveur affiche les balises a coller dans le code
personnalise d'une page Webflow :

```html
<link href="http://localhost:3000/dev/scroll-video.css" rel="stylesheet" />
<script defer src="http://localhost:3000/dev/scroll-video.js"></script>
```

Publie sur le domaine de staging `*.webflow.io` avec ces deux lignes a la place
des URL jsDelivr, et le site charge ton code local : une sauvegarde suffit a
voir l'effet, sans commit, sans tag, sans televersement. Le code personnalise ne
s'executant pas dans le preview du Designer, il faut publier au moins une fois.

`http://localhost` echappe au blocage du contenu mixte : une page en HTTPS a le
droit de charger ces deux fichiers. Un tunnel n'est necessaire que pour tester
depuis un telephone, dont le localhost n'est pas le tien.

Le mode watch ecrit dans `dev/`, jamais dans `dist/` : ce dernier est versionne
et sert de source a jsDelivr, un bundle de developpement n'a rien a y faire.

## Mise en production

Les medias et le code sont heberges separement : les MP4 sur Bunny, le bundle
sur GitHub via jsDelivr. Voir [`docs/hosting.md`](docs/hosting.md).

```bash
# 0. Inspecter les masters, puis les confronter aux standards
./scripts/probe.sh masters/*.mp4
./scripts/check-video.sh masters/video1.mp4:166:398 masters/video2.mp4:116:247

# 1. Encoder les masters (all-intra sur la plage scrubee)
./scripts/encode.sh masters/video1.mp4:166:398 masters/video2.mp4:116:247

# 1 bis. Controler ce qui sera televerse
./scripts/check-video.sh public/assets

# 2. Televerser les medias sur Bunny
export BUNNY_STORAGE_ZONE=ma-zone BUNNY_STORAGE_KEY=xxxxxxxx
./scripts/upload-bunny.sh

# 3. Verifier que le CDN sert bien du MP4 brut avec Range et CORS
./scripts/check-cdn.sh https://ma-zone.b-cdn.net/scroll-video/v1/video1-1280.mp4

# 4. Publier le code : dist/ est versionne, c'est ce que jsDelivr sert
pnpm build
git add dist && git commit -m "build: v1.0.0"
git tag v1.0.0 && git push --tags
```

Il reste a coller [`webflow/head.html`](webflow/head.html) et
[`webflow/footer.html`](webflow/footer.html) dans le code personnalise de la
page, et a construire la structure decrite dans
[`docs/webflow-setup.md`](docs/webflow-setup.md).

## Preparer une nouvelle video

Une commande, une video, un dossier pret a televerser :

```bash
./scripts/export.sh masters/video3.mp4
```

Elle sort `exports/video3/`, contenant chaque largeur et son poster :

| Fichier | Definition | Sert |
| --- | --- | --- |
| `video3-1920.mp4` + `-poster.jpg` | 1920x1080, soit 1080p | desktop |
| `video3-1280.mp4` + `-poster.jpg` | 1280x720, soit 720p | portables, tablettes |
| `video3-750.mp4` + `-poster.jpg` | 750x422 | mobile |

Il ne reste qu'a deposer le contenu de ce dossier, a plat, dans la Storage Zone
Bunny sous `scroll-video/v1/`. Le script rappelle le chemin exact, la commande
de verification du CDN, et les attributs a coller dans le Designer.

Les largeurs viennent de `widths` dans [`src/config.js`](src/config.js), et les
noms de fichiers sont un contrat : le lecteur construit ses URL a partir de la,
renommer un fichier le rend introuvable.

`export.sh` n'encode pas lui-meme, il enchaine : controle du master, puis
`encode.sh`, puis controle de l'export. Un master hors standards arrete tout
avant l'encodage.

Ce que le client doit livrer et ce qu'il ne doit surtout pas faire tient dans
[`docs/nouvelle-video.md`](docs/nouvelle-video.md), ecrit pour etre transmis
tel quel.

### Avec ou sans decoupage

Sans decoupage, le fichier sort **entierement all-intra** : toutes les images
sont des images cles, donc n'importe quel `data-vb-transition` fonctionne, et
le changer plus tard ne demande aucun reencodage. C'est le mode confortable,
paye en poids — trois fois le fichier decoupe, mesure sur `video2`.

Une fois le point de bascule arrete devant la vraie page, relancer avec le
decoupage pour revenir au poids normal :

```bash
./scripts/export.sh masters/video3.mp4:166:398
```

Le controle de poids sert de rappel : tant qu'il proteste, c'est qu'on paie
encore l'all-intra sur toute la longueur.

### Les standards, en detail

Les deux videos actuelles ont ete encodees pour ce scrub precis ; les
suivantes doivent tenir les memes contraintes. `check-video.sh` les verifie a
la place de l'oeil, avant comme apres encodage, et sort en erreur des qu'une
n'est pas tenue. `export.sh` l'appelle deux fois pour nous, mais il s'utilise
seul :

```bash
./scripts/check-video.sh masters/video3.mp4:166:398   # le master est-il utilisable
./scripts/check-video.sh public/assets                # l'encode est-il servable
```

Il ne recopie pas les standards : la cadence et les largeurs sont lues dans
[`src/config.js`](src/config.js), donc changer la config change ce qu'il exige.

| Ce qu'il exige d'un master | Pourquoi |
| --- | --- |
| Cadence constante | Le decoupage se declare en numeros d'image ; une cadence variable fait deriver la conversion en secondes |
| Cadence egale a `config.fps` | Sinon la balise doit porter `data-vb-fps`, que le script rappelle |
| Largeur >= la plus grande largeur encodee | Encoder en 1920 depuis un master plus petit serait un agrandissement |
| Format >= 16/9 | Le plein ecran recadre en `cover` : un master plus etroit se fait rogner |
| Aucune rotation en metadonnees | Le stage ne la lit pas, l'image sortirait couchee |
| Plage scrubee assez longue | Au-dela de 20 px de scroll par image, le scrub se voit par a-coups |
| Geometrie identique d'un master a l'autre | Les videos s'echangent a chaud, un saut de cadrage se verrait |

| Ce qu'il exige d'un encode | Pourquoi |
| --- | --- |
| Plage all-intra en tete | C'est ce qui rend le seek instantane ; le script la mesure et en deduit le `data-vb-transition` maximal |
| `moov` avant `mdat` | Sans faststart, le premier seek attend le fichier entier |
| yuv420p 8 bits, level <= 4.1 | Ce que decodent Safari et les appareils anciens |
| Aucune piste audio | Elle bloque l'autoplay et pese pour rien |
| Jeu de largeurs complet, poster present | Le lecteur demande une largeur precise, et le poster est le repli `prefers-reduced-motion` |
| Poids sous budget | 4 Mo par tranche de 1000 px de large, `MB_PER_1000PX` pour l'ajuster |

Le script propose aussi, quand la densite le permet, un `SCRUB_DIVISOR=2` qui
allege le fichier d'environ 40 %, et imprime la ligne `encode.sh` et les
attributs `<video>` prets a coller.

## Reglages

Le decoupage de chaque video se pose **sur la balise elle-meme**, en numeros
d'image, depuis le Designer Webflow (Settings > Custom attributes) :

```html
<video data-vb-video="v1" data-vb-file="video1" data-vb-transition="166" data-vb-end="398"></video>
<video data-vb-video="v2" data-vb-file="video2" data-vb-transition="116" data-vb-end="247"></video>
```

`data-vb-transition` est l'image ou le scrub s'arrete et la boucle commence.
`data-vb-end` est optionnel : sans lui, la boucle va jusqu'a la fin du fichier.

Le reste (fondus, inertie du scrub, largeurs encodees, comportement mobile) se
regle dans [`src/config.js`](src/config.js), ou sans rebuild via
`window.SCROLL_VIDEO_CONFIG` :

```html
<script>
  window.SCROLL_VIDEO_CONFIG = { fadeMs: 180, jumpFadeMs: 0 };
</script>
```

Attention : changer `data-vb-transition` suppose de reencoder, la plage scrubee
devant etre all-intra (`./scripts/encode.sh masters/video1.mp4:166:398 ...`).

## Structure

Le detail de qui fait quoi, et pourquoi, est dans
[`docs/architecture.md`](docs/architecture.md) — la page a lire avant de
toucher a `src/`.

```
src/
  config.js              reglages globaux ; le decoupage se lit sur les balises
  Stage.js               machine a etats (activeId / mode / progress)
  playback.js            choix compact (< 991 px) vs scrub desktop
  compact.js             visibilite de la section demo → loop / idle
  scroll.js              cablage GSAP ScrollTrigger ; collapse 100dvh apres latch
  frame.js               le fond quitte le plein ecran pour [data-vb-frame]
  progress.js            publie --vb-scrub, data-vb-mode, data-vb-current ; data-vb-shown sur [data-vb-when]
  usecases.js            selecteur de use-case et avancee de la boucle
  main.js                initialisation et garde-fous
  env.js                 reduced-motion, save-data, largeur utile, breakpoint compact
  utils.js               clamp, wait, emetteur d'evenements
  layers/
    VideoLayer.js        le contrat d'une couche d'image
    Mp4VideoLayer.js     implementation <video> + MP4
  styles/
    scroll-video.css     styles structurels, cibles par attributs data-vb-*
demo/
  demo.js, DebugLayer.js page de demonstration sans fichiers video
  bundle.html            verification du bundle de production
test/
  config.test.mjs        lecture des attributs data-vb-*
  stage.test.mjs         machine a etats, sans navigateur
  e2e.mjs                parcours complet dans un vrai moteur de rendu
scripts/
  export.sh              d'une video a un dossier pret pour Bunny
  check-video.sh         standards de la video, avant et apres encodage
  encode.sh              encodage ffmpeg all-intra
  upload-bunny.sh        televersement CDN
  check-cdn.sh           controle Range / CORS / MIME
bin/
  build.js               esbuild : watch + serveur local, ou build de production
  serve-media.js         service des medias avec Range, ce qu'esbuild ne fait pas
  live-reload.js         recharge la page a chaque rebuild, injecte en dev seul
docs/
  architecture.md        comment le code est organise
  webflow-setup.md       la structure a construire dans le Designer
  hosting.md             Bunny pour les medias, jsDelivr pour le bundle
  nouvelle-video.md      a transmettre au client qui fournit un master
```

## Tests

```bash
pnpm test                 # attributs et machine a etats, sans navigateur
pnpm test:e2e             # parcours complet sur les canvas de test
REAL=1 pnpm test:e2e      # meme parcours sur les vrais MP4 encodes
```

Tous exigent `pnpm dev` dans un autre terminal.

Pour eprouver ce qui sera reellement en ligne — le bundle construit, les videos
tirees du CDN — il reste `test:bundle`, dernier filet avant de publier un tag :

```bash
pnpm build
pnpm test:bundle
```

La seule difference qui subsiste avec la page Webflow est l'URL du bundle.

### Le moteur, pas seulement le parcours

`BROWSER=` choisit le moteur de rendu, `webkit` etant celui de Safari :

```bash
BROWSER=webkit REAL=1 pnpm test:e2e
BROWSER=firefox pnpm test:e2e
```

C'est la ou se joue le risque du rendu `<video>` : le scrub depend du decodeur,
et Safari peut se figer sur des seeks rapides la ou Chromium ne bronche pas.

Le test depose des captures dans `.artifacts/` et verifie les seize etapes du
parcours, dont la retroactivite et le recadrage. En mode `REAL=1` il en ajoute
une dix-septieme, qui mesure le cout d'un seek : au-dela de 33 ms de mediane le
scrub ne peut pas tenir 30 images par seconde, et il faut envisager la sequence
d'images.

Releve actuel, sur les MP4 encodes :

| Moteur | Seek median | Pire cas |
| --- | --- | --- |
| WebKit | 2 ms | 5 ms |
| Chromium | 5 ms | 9 ms |

Reste hors de portee : **iOS**. WebKit de bureau partage le decodeur de Safari,
mais pas ses regles d'autoplay ni son economiseur d'energie. Le deblocage au
premier geste ne se verifie que sur un appareil reel.

## Migrer vers un rendu par sequence d'images

Le scrub d'une balise `<video>` depend du decodeur du navigateur. Les mesures
ci-dessus rendent cette migration improbable — WebKit seek plus vite que
Chromium — mais elle reste ouverte si iOS se comporte autrement. La bascule
vers un rendu `<canvas>` alimente par une sequence d'images ne demande qu'une
seconde implementation de [`VideoLayer`](src/layers/VideoLayer.js) et sa
substitution dans `main.js`. Ni la machine a etats ni le pilotage du scroll ne
changent — [`demo/DebugLayer.js`](demo/DebugLayer.js) en est la preuve, c'est
deja une implementation canvas complete du meme contrat.

Le `crossOrigin` pose sur les balises `<video>` est la ou pour cette raison :
sans lui, un canvas lisant des pixels venus du CDN serait teinte et illisible.

## Point encore ouvert

Le passage de `loop` a `scrub` provoque un recul : la boucle peut etre a
00:04:50 quand le scroll impose 00:03:00. Un clignement de 150 ms l'absorbe par
defaut (`jumpFadeMs`). Mettre cette valeur a `0` donne un cut sec. A reevaluer
avec les vraies videos, un rembobinage accelere pouvant mieux convenir selon le
contenu.
