# Servir le bundle depuis Cloudflare plutot que Netlify

- Date : 2026-10-06
- Statut : Adopte (remplace [0008](0008-bundle-sur-netlify.md))

## Contexte

Le client heberge chez Cloudflare. Dans le cadre de la passation, le bundle
quitte le compte Netlify de l'agence pour un Worker Cloudflare branche sur
le depot GitHub, sous le domaine `dev-vb.initweb.ai`. Le premier deploiement
echouait : `wrangler deploy` ne trouvait aucun dossier de fichiers statiques.

## Decision

- `wrangler.jsonc` a la racine declare `dist/` comme dossier d'assets, sans
  script Worker : le Worker ne sert que des fichiers statiques.
- `dist/_headers` remplace `netlify.toml` : revalidation a chaque visite
  (`max-age=0, must-revalidate`) et CORS ouverts.
- Les reecritures des anciennes URL (`/scroll-video.*`, `/dist/*`) sont
  abandonnees : les snippets Webflow pointent sur `/index.js` et `/index.css`
  depuis l'ADR 0009.
- URL fixe sans version : `dev-vb.initweb.ai/index.{js,css}`.

## Consequences

- Publier reste `pnpm build`, commit de `dist/`, push. Rien a toucher dans
  Webflow.
- Les snippets `webflow/head.html` et `footer.html` et l'interception du
  test e2e pointent sur le nouveau domaine : a recoller dans Webflow.
- `_headers` vit dans `dist/`, dossier de sortie d'esbuild, qui n'efface pas
  les fichiers qu'il n'ecrit pas. Il est versionne comme le bundle.
- Le domaine `dev-vb` est provisoire ; en changer impose de recoller les deux
  snippets et de modifier `test/e2e.mjs`.
