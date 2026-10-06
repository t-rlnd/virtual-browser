# Servir le bundle depuis Netlify plutot que jsDelivr

- Date : 2026-09-30
- Statut : Remplace par [0010](0010-bundle-sur-cloudflare.md) (remplacait la partie code de [0001](0001-hebergement-bunny-jsdelivr.md))

## Contexte

Le bundle etait servi par jsDelivr sur un tag git : chaque mise a jour
imposait un tag, puis de changer le numero de version dans les deux snippets
Webflow. Le site est desormais deploye automatiquement sur Netlify depuis
GitHub. Mais Netlify publiait la racine du depot : page de demo en page
d'accueil, sources, docs et `package.json` accessibles publiquement.

## Decision

- `netlify.toml` publie **uniquement `dist/`**, sans commande de build
  (`dist/` reste versionne et construit en local).
- URL fixe, sans version : `virtual-browser.netlify.app/scroll-video.{js,css}`.
- En-tete `Cache-Control: max-age=0, must-revalidate` : chaque visite
  revalide, un push est visible immediatement.
- Plus de tags git pour publier.

## Consequences

- Publier = `pnpm build`, commit de `dist/`, push. Rien a toucher dans Webflow.
- Oublier `pnpm build` avant de pousser publie l'ancien bundle : c'est la
  contrepartie de l'absence de build cote Netlify.
- Retour arriere via l'historique des deploiements Netlify ou `git revert`,
  plus via un numero de version dans Webflow.
- La page de demo (`index.html`, `demo/`) est supprimee : le HTML vit dans
  Webflow, le depot ne livre que JS/CSS. Les tests e2e tournent sur le site
  Webflow publie, avec le bundle local injecte.
- Bunny reste inchange pour les medias.
