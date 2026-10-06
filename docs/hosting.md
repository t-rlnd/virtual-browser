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

## Le code : ce dont il a besoin

Le bundle est **commité** dans `dist/` (`index.js`, `index.css`,
`_headers`). C'est la seule raison pour laquelle un artefact de build est
versionné ici : l'hébergeur n'a rien à construire, il sert ce dossier tel
quel. N'importe quel hébergement statique convient, à trois conditions :

1. servir `dist/` à une **URL fixe**, sans numéro de version, pour que les
   snippets Webflow n'aient jamais à changer ;
2. répondre avec `Cache-Control: public, max-age=0, must-revalidate`, pour
   qu'un déploiement soit visible à la visite suivante ;
3. répondre avec `Access-Control-Allow-Origin: *`.

Les deux en-têtes sont dans [`dist/_headers`](../dist/_headers), au format
que lisent Cloudflare et Netlify. Un autre hébergeur (Vercel, S3 + CDN,
serveur maison…) les pose à sa façon. Si l'URL change, recoller
[`webflow/head.html`](../webflow/head.html) et
[`webflow/footer.html`](../webflow/footer.html) dans Webflow.

## Option recommandée : un Worker Cloudflare branché sur GitHub

C'est l'hébergement en place (`dev-vb.initweb.ai`) et le plus simple à
reproduire : pas de code serveur, déploiement automatique à chaque push,
[`wrangler.jsonc`](../wrangler.jsonc) à la racine dit déjà tout ce qu'il
faut (dossier d'assets `./dist`, rien d'autre en ligne).

Pour le recréer dans un autre compte Cloudflare :

1. **Workers & Pages › Create › Import a repository**, choisir le dépôt et
   la branche `main`.
2. Commande de build : **vide** (`dist/` est déjà construit). Commande de
   déploiement : `npx wrangler deploy`. Cloudflare lit `wrangler.jsonc`.
3. Une fois le premier déploiement passé, **Settings › Domains & Routes ›
   Add › Custom domain** et choisir le domaine définitif (le DNS doit être
   chez Cloudflare, ou un CNAME vers le `*.workers.dev` fourni).
4. Vérifier : `curl -I https://LE-DOMAINE/index.js` doit montrer les deux
   en-têtes ci-dessus, puis `BUNDLE=prod pnpm test:e2e` une fois les
   snippets Webflow recollés avec la nouvelle URL.

```
https://dev-vb.initweb.ai/index.js
https://dev-vb.initweb.ai/index.css
```

Publier une mise à jour du code :

```bash
pnpm test
pnpm build
pnpm test:bundle                   # rejoue le parcours sur dist/
git add dist && git commit -m "build: ..."
git push
```

Rien à changer dans Webflow : l'URL ne porte pas de version, et chaque
visite revalide (304 si rien n'a changé). Contrepartie : pas de version
figée à laquelle revenir depuis Webflow ; un retour arrière se fait chez
l'hébergeur (Cloudflare : Deployments › rollback) ou par `git revert`.

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
