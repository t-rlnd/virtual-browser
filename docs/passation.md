# Passation au client

Checklist pour transmettre le projet à une équipe technique côté client. Le
dépôt est conçu pour qu'un développeur qui ne l'a jamais vu puisse le reprendre
avec le README, cette page et `docs/architecture.md`.

## 1. Ce qui est transmis

| Quoi | Où aujourd'hui | À transférer |
| --- | --- | --- |
| Code source, docs, `dist/` | GitHub `t-rlnd/virtual-browser` | transfert du dépôt vers l'organisation du client (Settings › Danger zone › Transfer) ou fork + archivage |
| Bundle en ligne (`index.js` / `.css`) | Cloudflare `dev-vb.initweb.ai`, branché sur `main` | projet Pages à recréer dans le compte Cloudflare du client, branché sur le dépôt transféré, domaine définitif à choisir |
| Vidéos et posters | Bunny, zone `virtual-browser` du client (préfixe `home/v1/`) | fait : zone créée et fichiers copiés le 2026-10-06 |
| Site | Webflow `virtual-browser.webflow.io` | transfert du site Webflow vers le workspace du client |
| Masters vidéo | hors dépôt (`masters/`, non versionné) | remettre les masters au client : seuls eux permettent de ré-encoder |

Les masters ne sont **pas** dans git. Avant la passation, vérifier que le
client possède bien le master de chaque vidéo en ligne (`hero`, `video1`,
`video2`…). Sans master, une vidéo ne peut plus être ré-encodée.

## 2. Où changent les adresses

Trois hôtes sont écrits en dur. Les retrouver tous :

```bash
grep -rnE "initweb\.ai|b-cdn\.net|webflow\.io" src webflow test bin docs README.md CLAUDE.md
```

| Hôte | Fichiers | Effet d'un changement |
| --- | --- | --- |
| Bunny (`virtual-browser.b-cdn.net`) | `src/config.js` (`base`), `webflow/head.html` (preconnect) | rebuild + commit de `dist/` + push, puis recoller `head.html` dans Webflow |
| Cloudflare (`dev-vb.initweb.ai`) | `webflow/head.html`, `webflow/footer.html`, `test/e2e.mjs` (interception) | recoller les deux snippets dans Webflow ; sinon le site charge l'ancien bundle |
| Webflow (`virtual-browser.webflow.io`) | `bin/build.js`, `test/e2e.mjs` (surchargeable par `SITE_URL=`), docs | les tests e2e tournent sur ce site publié |

Ordre conseillé : d'abord Bunny (le code pointe sur la nouvelle zone), puis
Cloudflare (nouvelle URL du bundle), puis les snippets Webflow. Entre chaque
étape, `pnpm test:bundle` puis `BUNDLE=prod pnpm test:e2e` pour vérifier ce
qui est réellement en ligne.

## 3. Déplacer les vidéos vers une nouvelle zone Bunny

1. Créer Storage Zone + Pull Zone chez le client
   ([`hosting.md`](hosting.md#option-retenue--bunny)), avec
   `Access-Control-Allow-Origin: *`.
2. Copier les fichiers de l'ancienne zone vers la nouvelle, **à plat**, sous
   le même préfixe `home/v1/` (ou `v2/` si l'on en profite pour
   ré-encoder). Ils ne doivent être ni renommés ni recompressés.
3. Vérifier chaque largeur :
   `./scripts/check-cdn.sh https://NOUVELLE-ZONE.b-cdn.net/home/v1/hero-1920.mp4`
4. Changer `base` dans [`src/config.js`](../src/config.js) et le preconnect
   dans [`webflow/head.html`](../webflow/head.html), `pnpm build`, commit,
   push, recoller `head.html`.
5. Ne couper l'ancienne zone qu'une fois le site publié vérifié.

## 4. Ce que l'équipe du client doit savoir

- **Pas de build côté Cloudflare** : `dist/` est versionné et doit être
  reconstruit (`pnpm build`) avant chaque push. Oublier publie l'ancien bundle.
- **Pas de page HTML dans le dépôt** : le HTML vit dans Webflow, le script ne
  s'appuie que sur les attributs `data-vb-*` ([`webflow-setup.md`](webflow-setup.md)).
- **MP4 bruts uniquement**, jamais Bunny Stream ni Cloudflare Stream : le
  streaming adaptatif casse le scrub ([`hosting.md`](hosting.md)).
- **Ajouter une vidéo** ne demande aucun code : une `<video>` et un bouton dans
  le Designer, les fichiers sur Bunny ([`nouvelle-video.md`](nouvelle-video.md)).
- **Tests** : `pnpm test` (sans navigateur) et `pnpm test:e2e` (site Webflow
  publié + bundle local), détaillés dans [`tests.md`](tests.md).
- **Noms hérités** : `scroll-video` (préfixe CDN, `window.SCROLL_VIDEO_CONFIG`,
  `window.scrollVideo`, préfixe des logs) est l'ancien nom du projet, conservé
  parce que le changer casserait Webflow et Bunny. `virtual-browser` est le nom
  du dépôt et des hébergements, `vb` celui des attributs.
- **Décisions** : chaque choix structurant a sa fiche dans
  [`decisions/`](decisions/), l'historique dans [`history/`](history/).

## 5. Avant de remettre les clés

- [ ] Todo P1 de [`todo.md`](todo.md) fermées (snippets en Site settings,
      bouton pause, layout < 991 px) — sinon les lister explicitement au client.
- [ ] `dist/_headers` présent dans le dépôt (revalidation + CORS côté
      Cloudflare).
- [ ] `pnpm test`, `pnpm build`, `pnpm test:bundle` au vert sur `main`.
- [ ] Masters remis au client.
- [ ] Secrets Bunny (`BUNNY_STORAGE_KEY`) régénérés côté client, jamais
      transmis en clair.
- [ ] Ce fichier et le README relus avec le nom des nouveaux hôtes.
