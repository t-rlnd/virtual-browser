# Fond video pilote au scroll (Webflow)

Un unique fond video plein ecran traverse deux sections : il est **scrube par
le scroll** sur la premiere, puis **boucle en autonomie** sur la seconde, ou
deux use-cases permettent d'echanger la video a chaud.

Le choix de use-case est **retroactif** : apres avoir bascule sur la video 2,
remonter vers la section 1 rembobine la video 2, pas la video 1.

## Le comportement en trois modes

| Mode | Quand | Ce que fait la video active |
| --- | --- | --- |
| `scrub` | Jusqu'a ce que la section 2 remplisse l'ecran | En pause, son `currentTime` est ecrit par la position de scroll sur 00:00 → 00:03 |
| `loop` | Section 2 pleine page, puis tant qu'elle reste visible | Lecture autonome, en boucle sur 00:03 → 00:06 |
| `idle` | Section 2 entierement sortie | Tout en pause, rien ne se decode |

Le scrub se poursuit pendant la montee de la section 2 et ne s'acheve qu'une
fois celle-ci a 100 % dans l'ecran : la course de scroll utile vaut donc la
hauteur complete de la section 1.

Cliquer sur un use-case change uniquement **quelle** video est active. Le mode
et la progression de scroll ne bougent pas, ce qui produit la retroactivite
sans code dedie.

## Demarrage

```bash
npm install
npm run dev
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
# 0. Inspecter les masters
./scripts/probe.sh masters/*.mp4

# 1. Encoder les masters (all-intra sur la plage scrubee)
./scripts/encode.sh masters/video1.mp4:166:398 masters/video2.mp4:116:247

# 2. Televerser les medias sur Bunny
export BUNNY_STORAGE_ZONE=ma-zone BUNNY_STORAGE_KEY=xxxxxxxx
./scripts/upload-bunny.sh

# 3. Verifier que le CDN sert bien du MP4 brut avec Range et CORS
./scripts/check-cdn.sh https://ma-zone.b-cdn.net/scroll-video/v1/video1-1280.mp4

# 4. Publier le code : dist/ est versionne, c'est ce que jsDelivr sert
npm run build
git add dist && git commit -m "build: v1.0.0"
git tag v1.0.0 && git push --tags
```

Il reste a coller [`webflow/head.html`](webflow/head.html) et
[`webflow/footer.html`](webflow/footer.html) dans le code personnalise de la
page, et a construire la structure decrite dans
[`docs/webflow-setup.md`](docs/webflow-setup.md).

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

```
src/
  config.js              reglages globaux ; le decoupage se lit sur les balises
  Stage.js               machine a etats (activeId / mode / progress)
  scroll.js              cablage GSAP ScrollTrigger
  usecases.js            selecteur de use-case
  main.js                initialisation et garde-fous
  env.js                 detection reduced-motion, pointeur, largeur utile
  layers/
    VideoLayer.js        le contrat d'une couche d'image
    Mp4VideoLayer.js     implementation <video> + MP4
  styles/
    scroll-video.css     styles structurels, cibles par attributs data-vb-*
demo/
  demo.js, DebugLayer.js page de demonstration sans fichiers video
  bundle.html            verification du bundle de production
scripts/
  encode.sh              encodage ffmpeg all-intra
  upload-bunny.sh        televersement CDN
  check-cdn.sh           controle Range / CORS / MIME
bin/
  build.js               esbuild : watch + serveur local, ou build de production
  serve-media.js         service des medias avec Range, ce qu'esbuild ne fait pas
  live-reload.js         recharge la page a chaque rebuild, injecte en dev seul
```

## Tests

```bash
npm test                 # machine a etats du Stage, sans navigateur
npm run test:e2e         # parcours complet sur les canvas de test
REAL=1 npm run test:e2e  # meme parcours sur les vrais MP4 encodes
```

Tous exigent `npm run dev` dans un autre terminal.

Pour eprouver ce qui sera reellement en ligne — le bundle construit, les videos
tirees du CDN — il reste `test:bundle`, dernier filet avant de publier un tag :

```bash
npm run build
npm run test:bundle
```

La seule difference qui subsiste avec la page Webflow est l'URL du bundle.

### Le moteur, pas seulement le parcours

`BROWSER=` choisit le moteur de rendu, `webkit` etant celui de Safari :

```bash
BROWSER=webkit REAL=1 npm run test:e2e
BROWSER=firefox npm run test:e2e
```

C'est la ou se joue le risque du rendu `<video>` : le scrub depend du decodeur,
et Safari peut se figer sur des seeks rapides la ou Chromium ne bronche pas.

Le test depose des captures dans `.artifacts/` et verifie les onze etapes du
parcours, dont la retroactivite. En mode `REAL=1` il en ajoute une douzieme,
qui mesure le cout d'un seek : au-dela de 33 ms de mediane le scrub ne peut
pas tenir 30 images par seconde, et il faut envisager la sequence d'images.

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
