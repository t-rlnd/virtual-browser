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

La page de demonstration tourne sur **DebugLayer**, un rendu `<canvas>` qui ne
demande aucun fichier video : c'est ce qui permet de valider le scroll et la
bascule avant meme d'avoir encode les masters. Un HUD affiche l'etat en direct.

Ajouter `?real` a l'URL pour utiliser les vrais MP4.

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
```

## Tests

```bash
npm test                 # machine a etats du Stage, sans navigateur
npm run test:e2e         # parcours complet sur les canvas de test
REAL=1 npm run test:e2e  # meme parcours sur les vrais MP4 encodes
```

Le test end-to-end verifie les dix etapes du parcours, dont la retroactivite,
et depose des captures dans `.artifacts/`.

En mode `REAL=1` il ajoute une onzieme etape qui mesure le cout reel d'un seek.
C'est le chiffre qui arbitre entre la balise `<video>` et la sequence
d'images : au-dela de 33 ms de mediane, le scrub ne peut pas tenir 30 images
par seconde et il faut envisager la migration.

Attention : ce test tourne dans Chromium. Il valide la justesse du
comportement, mais le risque reel du rendu `<video>` est Safari et iOS, qui ne
peuvent se verifier que sur un vrai appareil.

## Migrer vers un rendu par sequence d'images

Le scrub d'une balise `<video>` depend du decodeur du navigateur, et Safari
peut se figer sur des seeks rapides. Si le rendu ne convient pas, la bascule
vers un rendu `<canvas>` alimente par une sequence d'images ne demande qu'une
seconde implementation de [`VideoLayer`](src/layers/VideoLayer.js) et sa
substitution dans `main.js`. Ni la machine a etats ni le pilotage du scroll ne
changent — [`demo/DebugLayer.js`](demo/DebugLayer.js) en est la preuve, c'est
deja une implementation canvas complete du meme contrat.

## Point encore ouvert

Le passage de `loop` a `scrub` provoque un recul : la boucle peut etre a
00:04:50 quand le scroll impose 00:03:00. Un clignement de 150 ms l'absorbe par
defaut (`jumpFadeMs`). Mettre cette valeur a `0` donne un cut sec. A reevaluer
avec les vraies videos, un rembobinage accelere pouvant mieux convenir selon le
contenu.
