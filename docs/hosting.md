# Hébergement

Deux hébergeurs, séparés par nature de fichier :

| Quoi | Où | Pourquoi là |
| --- | --- | --- |
| MP4 et posters | Bunny (Storage + Pull Zone), `virtual-browser.b-cdn.net/home/v1/` | Volumineux, binaires, n'ont rien à faire dans git |
| `index.js` / `index.css` | Cloudflare (`dev-vb.initweb.ai`), déployé depuis `dist/` | Déploiement automatique à chaque push, URL fixe |

Tout ce qui concerne les vidéos (encodage, zone Bunny, téléversement,
vérification, versionnage du préfixe) est dans [`videos.md`](videos.md).
Cette page ne traite que du code.

## La règle qui prime sur tout le reste

Les MP4 sont servis **bruts**. Ni Bunny Stream ni Cloudflare Stream : ces
services transcodent en HLS, et le streaming adaptatif rend `currentTime`
imprécis. Les seeks se calent alors sur les frontières de segment, ce qui
détruit exactement la propriété dont dépend le scrub.

## Le code sur Cloudflare

Un Worker Cloudflare, sans code serveur, sert `dist/` en fichiers statiques.
Il est branché sur le dépôt GitHub (Workers & Pages › le Worker › Settings ›
Build) : chaque push sur `main` lance `wrangler deploy`, qui lit
[`wrangler.jsonc`](../wrangler.jsonc) à la racine. C'est ce fichier qui dit à
Cloudflare de ne publier que `dist/` : ni sources, ni docs en ligne. Le
domaine `dev-vb.initweb.ai` est rattaché au Worker dans le dashboard
(Settings › Domains & Routes).

```
https://dev-vb.initweb.ai/index.js
https://dev-vb.initweb.ai/index.css
```

Le bundle est **commité** dans `dist/` : c'est ce dossier, et lui seul, que
Cloudflare publie. C'est la seule raison pour laquelle un artefact de build
est versionné ici. La commande de build du projet Cloudflare peut rester
vide.

Publier une mise à jour du code :

```bash
pnpm test
pnpm build
pnpm test:bundle                   # rejoue le parcours sur dist/
git add dist && git commit -m "build: ..."
git push
```

Rien à changer dans Webflow : l'URL ne porte pas de version.
[`dist/_headers`](../dist/_headers) fait servir le bundle avec
`Cache-Control: max-age=0, must-revalidate`, donc chaque visite revalide
(304 si rien n'a changé) et un déploiement est visible tout de suite.
Contrepartie : pas de version figée à laquelle revenir depuis Webflow ; un
retour arrière se fait dans Cloudflare (Deployments › rollback) ou par
`git revert`.

## Ce qui est écrit en dur, et où

| Hôte | Fichiers | Effet d'un changement |
| --- | --- | --- |
| Bunny (`virtual-browser.b-cdn.net`) | `src/config.js` (`base`), `webflow/head.html` (preconnect) | rebuild + commit de `dist/` + push, puis recoller `head.html` dans Webflow |
| Cloudflare (`dev-vb.initweb.ai`) | `webflow/head.html`, `webflow/footer.html`, `test/e2e.mjs` | recoller les deux snippets dans Webflow |

Le piège : changer le CDN vidéo impose de republier le code, `base` étant
compilé dans le bundle.

Historique : le bundle a été servi par jsDelivr sur un tag git
([ADR 0001](decisions/0001-hebergement-bunny-jsdelivr.md)), puis par Netlify
([ADR 0008](decisions/0008-bundle-sur-netlify.md)), remplacé par
l'[ADR 0010](decisions/0010-bundle-sur-cloudflare.md).
