# virtual-browser

Code personnalisé du site Webflow Virtual Browser : un bundle JS/CSS unique
(`index.js` + `index.css`), chargé sur toutes les pages, sans framework.

## Ce que contient le bundle

| Module | S'active sur | Rôle |
| --- | --- | --- |
| Smooth scroll | tout le site | Lenis, synchronisé avec GSAP |
| Héros | `[data-vb-hero]` | Vidéo de fond pilotée par le scroll, trois textes qui basculent à 1/3 et 2/3 |
| Protocol | `[data-vb-stage]` + `[data-vb-scrub]` | Vidéo scrubbée puis bouclée dans un cadre, bascule entre use-cases, pause |

Chaque module ne démarre que si sa structure est dans la page. Le script ne
cible que des attributs `data-vb-*`, jamais des classes : le Designer reste
libre. Les vidéos sont servies par Bunny, le bundle par Cloudflare.

Ce que voit le visiteur et comment c'est construit :
[`docs/fonctionnement.md`](docs/fonctionnement.md).

## Prérequis

- [Node.js](https://nodejs.org) 18 ou plus
- [pnpm](https://pnpm.io) 10 ou plus (`npm i -g pnpm`)
- [ffmpeg](https://ffmpeg.org) (`brew install ffmpeg`), seulement pour encoder des vidéos

## Installation

```bash
pnpm install
pnpm test:setup     # une fois : navigateurs Playwright pour les tests e2e
```

## Développement

```bash
pnpm dev
```

Le HTML vit dans Webflow, pas ici. Avec `pnpm dev` lancé, ouvrir le site
publié avec `?dev` à la fin de l'URL charge le bundle local au lieu de celui
en ligne : `https://virtual-browser.webflow.io/?dev`. Détails dans
[`docs/webflow-setup.md`](docs/webflow-setup.md#8-developper-contre-le-site-sans-republier).

## Scripts

| Commande | Effet |
| --- | --- |
| `pnpm dev` | Build en continu dans `dev/` + serveur local sur `http://localhost:3000` |
| `pnpm build` | Build de production dans `dist/` (versionné, publié par Cloudflare) |
| `pnpm test` | Tests unitaires, sans navigateur |
| `pnpm test:e2e` | Parcours complet sur le site Webflow publié, bundle `dev/` injecté |
| `pnpm test:bundle` | Même parcours avec `dist/`, à lancer avant de pousser |
| `pnpm export -- masters/video3.mp4:166:398` | Encode une vidéo pour le scrub, sort `exports/video3/` |
| `pnpm upload -- exports/video3` | Téléverse un export sur Bunny |
| `pnpm check -- <fichier ou dossier>` | Contrôle un master ou un export |

## Publier

```bash
pnpm test && pnpm build && pnpm test:bundle
git add dist && git commit -m "build: ..."
git push
```

Cloudflare redéploie `dist/` à chaque push sur `main`. Rien à changer dans
Webflow : l'URL du bundle ne porte pas de version.

## Structure du dépôt

```
src/          le code livré dans le bundle          → docs/architecture.md
  main.js       point d'entrée
  config.js     réglages globaux + lecture des attributs data-vb-*
  Stage.js      machine à états de Protocol
  hero.js       section Héros
  layers/       pilotage des <video>
  styles/       CSS livré avec le script
test/         tests unitaires (*.test.mjs) et parcours e2e (e2e.mjs)
scripts/      encodage et mise en ligne des vidéos (ffmpeg, Bunny)
bin/          build esbuild, serveur local, rechargement auto
webflow/      les deux snippets à coller dans Webflow
dist/         le bundle de production (versionné, publié par Cloudflare)
docs/         toute la documentation
```

## Documentation

Sommaire dans [`docs/README.md`](docs/README.md). Les trois pages à lire en
premier :

- [`docs/fonctionnement.md`](docs/fonctionnement.md) : ce que fait le site, section par section
- [`docs/architecture.md`](docs/architecture.md) : comment le code est organisé, à lire avant de toucher à `src/`
- [`docs/videos.md`](docs/videos.md) : comprimer une vidéo, la stocker sur Bunny, la servir dans Webflow

## Auteur

Théo ROLAND, [initStudio](https://initweb.ai), pour Virtual Browser.
