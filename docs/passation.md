# Passation au client

Checklist pour transmettre le projet à une équipe technique côté client. Le
dépôt est conçu pour qu'un développeur qui ne l'a jamais vu puisse le reprendre
avec le README, cette page, [`fonctionnement.md`](fonctionnement.md) et
[`architecture.md`](architecture.md).

## 1. Ce qui est transmis

| Quoi | Où aujourd'hui | À transférer |
| --- | --- | --- |
| Code source, docs, `dist/` | GitHub `t-rlnd/virtual-browser` | transfert du dépôt vers l'organisation du client (Settings › Danger zone › Transfer) ou fork + archivage |
| Bundle en ligne (`index.js` / `.css`) | Worker Cloudflare `dev-vb.initweb.ai`, branché sur `main` | Worker à recréer dans le compte Cloudflare du client (assets `dist/`, voir `wrangler.jsonc`), branché sur le dépôt transféré, domaine définitif à choisir |
| Vidéos et posters | Bunny, zone `virtual-browser` du client (préfixe `home/v1/`) | fait : zone créée et fichiers copiés le 2026-10-06 |
| Site | Webflow `virtual-browser.webflow.io` | transfert du site Webflow vers le workspace du client |
| Masters vidéo | chez le client uniquement (aucune copie à l'agence) | rien : seuls les exports sont en ligne sur Bunny ; ré-encoder une vidéo demande le master au client |

Les masters ne sont **ni dans git ni sur le poste de l'agence** : les seules
vidéos existantes sont les exports en ligne sur Bunny. Ré-encoder une vidéo
(`hero`, `video1`, `video2`…) demande son master au client. Sans master, un
export ne peut pas être refait.

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
  le Designer, les fichiers sur Bunny ([`videos.md`](videos.md)).
- **Tests** : `pnpm test` (sans navigateur) et `pnpm test:e2e` (site Webflow
  publié + bundle local), détaillés dans [`tests.md`](tests.md).
- **Noms hérités** : `scroll-video` (préfixe CDN, `window.SCROLL_VIDEO_CONFIG`,
  `window.scrollVideo`, préfixe des logs) est l'ancien nom du projet, conservé
  parce que le changer casserait Webflow et Bunny. `virtual-browser` est le nom
  du dépôt et des hébergements, `vb` celui des attributs.
- **Décisions** : chaque choix structurant a sa fiche dans
  [`decisions/`](decisions/), l'historique dans [`history/`](history/).

## 5. Avant de remettre les clés

- [ ] Snippets `webflow/head.html` et `footer.html` collés dans les **Site
      settings** (toutes les pages) et retirés des Page settings de la home,
      sinon le bundle est chargé deux fois.
- [ ] `dist/_headers` présent dans le dépôt (revalidation + CORS côté
      Cloudflare).
- [ ] `pnpm test`, `pnpm build`, `pnpm test:bundle` au vert sur `main`.
- [ ] Le client sait que les masters sont de son côté (aucune copie à l'agence).
- [ ] Secrets Bunny (`BUNNY_STORAGE_KEY`) régénérés côté client, jamais
      transmis en clair.
- [ ] Ce fichier et le README relus avec le nom des nouveaux hôtes.
