# Fond vidéo piloté au scroll (Webflow)

Un script à coller dans un site Webflow : il fait **avancer une vidéo au
rythme du scroll**, puis la laisse **tourner en boucle** dans un cadre, avec
des onglets pour changer de vidéo.

Pas de framework : du JavaScript « vanilla », [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
pour écouter le scroll, et [esbuild](https://esbuild.github.io/) pour produire
un fichier unique à charger dans Webflow.

> Un mot inconnu (scrub, all-intra, sticky, CDN…) ? Voir le
> [glossaire](docs/glossaire.md).

---

## Ce que voit le visiteur

La page contient deux animations indépendantes, livrées dans le même fichier :

**1. Le Héros** (en haut de page) — une vidéo avance quand on scrolle, derrière
un titre. Le texte change deux fois (à 1/3 et 2/3 de la vidéo), ligne par
ligne.

**2. Protocol** (juste après) — le cœur du projet, en trois temps :

| Temps | Ce qui se passe | Nom dans le code |
| --- | --- | --- |
| 1. On scrolle | La vidéo plein écran avance avec le scroll, le titre s'efface, la vidéo rétrécit pour se caler dans un cadre | `scrub` |
| 2. On arrive au bout | La vidéo joue seule en boucle dans son cadre : 4 tours, puis le use-case suivant. Des onglets permettent de changer de vidéo, un bouton de mettre en pause | `loop` |
| 3. On sort de la section | Tout se met en pause, rien ne tourne pour rien | `idle` |

Une fois la boucle atteinte, **remonter ne rembobine plus** : la vidéo reste
dans son cadre (réglage `latchLoop`).

**Sous 991 px** (tablette, mobile), Protocol n'a plus de scrub : les sections
s'empilent normalement et la vidéo boucle directement dans son cadre. Le Héros,
lui, garde son scrub.

---

## L'idée clé, en une phrase

Le scroll ne produit **qu'un seul nombre**, une progression de 0 à 1. Tout le
reste en découle : la position dans la vidéo, la taille du cadre, l'apparition
des textes.

```
scroll ──► progression 0 → 1 ──┬──► la vidéo avance       (JS)
                               ├──► le cadre se resserre  (JS → variables CSS)
                               └──► titres et onglets     (CSS, via --vb-scrub)
```

Le JavaScript publie ce nombre dans une variable CSS, `--vb-scrub`. Les
apparitions/disparitions sont donc écrites **en CSS**, pas en JS.

---

## Démarrer en local

Prérequis : [Node.js](https://nodejs.org) et [pnpm](https://pnpm.io)
(`npm i -g pnpm`). Pour encoder des vidéos : `brew install ffmpeg`.

```bash
pnpm install
```

```bash
pnpm dev
```

Pas de page de démo : le HTML vit dans Webflow, ce dépôt ne livre que le
JS/CSS. On développe directement contre le site publié (section suivante).
Chaque sauvegarde reconstruit le code dans `dev/`.

### Tester sur le vrai site Webflow, sans republier

Les snippets Webflow savent charger ton code local : avec `pnpm dev` lancé,
ouvre le site publié en ajoutant **`?dev`** à l'URL.

```
https://virtual-browser.webflow.io/        ce que voit le visiteur (Netlify)
https://virtual-browser.webflow.io/?dev    ton code local (localhost:3000)
```

Le code personnalisé ne tourne pas dans le preview du Designer : il faut avoir
publié le site au moins une fois.

---

## Je veux…

| … | Où aller |
| --- | --- |
| Comprendre comment le code est organisé | [`docs/architecture.md`](docs/architecture.md) — à lire avant de toucher à `src/` |
| Construire ou modifier la page dans Webflow | [`docs/webflow-setup.md`](docs/webflow-setup.md) |
| Ajouter ou remplacer une vidéo | [`docs/nouvelle-video.md`](docs/nouvelle-video.md) (version client) · [`docs/videos.md`](docs/videos.md) (détail technique) |
| Publier une nouvelle version du code | [Publier](#publier-une-nouvelle-version) ci-dessous · [`docs/hosting.md`](docs/hosting.md) |
| Changer un réglage (fondu, nombre de tours…) | [Réglages](#réglages) ci-dessous · [`src/config.js`](src/config.js) |
| Lancer les tests | [`docs/tests.md`](docs/tests.md) |
| Savoir pourquoi un choix a été fait | [`docs/decisions/`](docs/decisions/) (une fiche par décision) |
| Voir ce qui reste à faire | [`docs/todo.md`](docs/todo.md) |

---

## Comment ça s'assemble dans Webflow

Le script ne s'appuie **que sur des attributs `data-vb-*`**, jamais sur des
classes. On peut renommer et restyler librement dans le Designer, tant que les
attributs restent en place (Settings › Custom attributes).

Les éléments indispensables de Protocol :

| Attribut | Rôle |
| --- | --- |
| `data-vb-scrub` | La « piste » : un bloc haut (300vh) qui donne la longueur de scroll |
| `data-vb-scrub-inner` | Le conteneur collé (`sticky`) qui reste à l'écran pendant qu'on scrolle la piste |
| `data-vb-stage` | Le fond vidéo, qui contient une `<video data-vb-id="uc1">` par use-case |
| `data-vb-intro` / `data-vb-loop` | Les deux sections, **superposées** : l'intro s'efface, la boucle apparaît |
| `data-vb-switch="uc1"` | Un onglet de use-case |
| `data-vb-frame` | Le cadre où la vidéo vient se loger |

La structure complète, pas à pas : [`docs/webflow-setup.md`](docs/webflow-setup.md).

Le **découpage de chaque vidéo** (où finit le scrub, où finit la boucle) se
règle aussi par attribut, en numéros d'image :

```html
<video data-vb-id="uc1" data-vb-asset="video1" data-vb-loop-at="166" data-vb-loop-end="398"></video>
```

Ajouter un use-case ne demande donc **aucune modification du code** : une
`<video>`, un onglet et ses cards dans le Designer suffisent.

---

## Où sont les fichiers

Deux hébergeurs, un par type de fichier :

| Quoi | Où | Pourquoi |
| --- | --- | --- |
| Vidéos MP4 et posters | **Bunny** (CDN) | Lourds, n'ont rien à faire dans git |
| Code (`dist/index.js` + `.css`) | **Netlify**, déployé depuis `dist/` à chaque push | URL fixe, rien à changer dans Webflow |

Deux règles à ne jamais enfreindre :

- **MP4 bruts uniquement**, jamais Bunny Stream ni Cloudflare Stream : le
  streaming adaptatif rend la position dans la vidéo imprécise et casse le
  scrub.
- **`dist/` reconstruit avant chaque push** : Netlify publie ce dossier tel
  quel, sans build.

Détails : [`docs/hosting.md`](docs/hosting.md).

---

## Publier une nouvelle version

```bash
pnpm test                          # tests rapides
pnpm build                         # produit dist/
pnpm test:bundle                   # rejoue le parcours sur dist/ (pnpm dev lancé à côté)
git add dist && git commit -m "build: ..."
git push                           # Netlify redéploie dist/
```

Rien à changer dans Webflow : l'URL du bundle ne porte pas de version.

Pourquoi `dist/` est versionné alors que c'est un fichier généré : c'est
précisément ce dossier que Netlify publie, sans rien construire.

---

## Réglages

Les réglages globaux vivent dans [`src/config.js`](src/config.js), chacun
commenté. Les plus utiles :

| Réglage | Défaut | Effet |
| --- | --- | --- |
| `loopRepeats` | `4` | Tours de boucle avant de passer au use-case suivant |
| `latchLoop` | `true` | Une fois la boucle atteinte, remonter ne rembobine plus |
| `fadeMs` | `250` | Durée du fondu entre deux use-cases (ms) |
| `dockRange` | `0.05 → 0.65` | Moment du scroll où la vidéo se cale dans son cadre |
| `scrubSmoothing` | `0.1` | Inertie du scrub (0 = collé au scroll) ; faible car Lenis lisse déjà |
| `smooth` | `true` | Smooth scroll Lenis sur tout le site (coupé en reduced-motion) |
| `lenis` | `{ lerp: 0.1 }` | Options Lenis : `lerp` plus petit = plus glissé |
| `compactMaxWidth` | `991` | Largeur sous laquelle Protocol passe en mode mobile |

On peut les surcharger **sans rebuild**, depuis Webflow, avant le script :

```html
<script>
  window.SCROLL_VIDEO_CONFIG = { loopRepeats: 2, fadeMs: 180 };
</script>
```

Changer une valeur **par défaut** (y compris `base`, l'adresse du CDN vidéo)
se fait dans `config.js` : elle est alors compilée dans le bundle, donc rebuild
et push.

Le **rythme** du scroll ne se règle pas ici mais dans le Designer : c'est la
hauteur de la piste (300vh pour Protocol, 400vh pour le Héros).

---

## Arborescence

```
src/            le code livré dans le bundle      → docs/architecture.md
  main.js         point d'entrée : démarre le Héros et Protocol
  config.js       réglages + lecture des attributs data-vb-*
  Stage.js        le « cerveau » de Protocol (état courant)
  hero.js         la section Héros
  layers/         pilotage des <video>
  styles/         CSS livré avec le script
test/           tests unitaires (*.test.mjs) et parcours navigateur (e2e.mjs)
scripts/        encodage et mise en ligne des vidéos (ffmpeg, Bunny)
bin/            outillage : build, serveur local, rechargement auto
webflow/        les deux snippets à coller dans Webflow
dist/           le bundle de production (versionné, publié par Netlify)
docs/           toute la documentation
```

---

## Limites connues

- **iOS ne se teste que sur un vrai iPhone.** Les tests WebKit reproduisent le
  décodeur de Safari, pas ses règles d'autoplay ni d'économie d'énergie.
- **Passage boucle → scrub** (quand `latchLoop: false`) : la vidéo recule d'un
  coup ; un clignement de 150 ms le masque (`jumpFadeMs`). À réévaluer avec les
  vraies vidéos.
- Si un jour le scrub vidéo ne tient pas sur un appareil, le code est prêt pour
  un rendu par séquence d'images : voir
  [`docs/architecture.md`](docs/architecture.md#pourquoi-une-classe-videolayer-abstraite).
