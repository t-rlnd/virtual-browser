# Separer l'hebergement video (Bunny) du code (GitHub/jsDelivr)

- Date : 2026-08-19
- Statut : Adopte

## Contexte

Le projet doit servir des MP4 (fond video scrubbable) et un bundle JS/CSS
(`scroll-video.js`/`.css`). Les MP4 sont volumineux et binaires ; le code est
versionne et diffable. Contrainte forte : le scrub depend d'un `currentTime`
precis, donc tout hebergeur qui transcode en streaming adaptatif (HLS) est
exclu.

## Decision

Deux hebergeurs distincts, separes par nature de fichier :

- MP4 et posters -> Bunny (Storage Zone + Pull Zone), stockage objet brut
  derriere un CDN, sans transcodage.
- `scroll-video.js`/`.css` -> commites dans `dist/`, servis depuis GitHub via
  jsDelivr (`cdn.jsdelivr.net/gh/...@tag/dist/...`).

Les MP4 sont ranges sous un prefixe versionne (`scroll-video/v1/`) plutot que
purges du cache : une nouvelle version de videos incremente le prefixe.

## Consequences

- Depot GitHub doit rester public (jsDelivr ne lit pas les depots prives).
- Toujours pointer jsDelivr sur un tag (`@v1.1.0`), jamais sur `@main` (cache
  7 jours cote jsDelivr).
- Deux compteurs de version independants : tag git (code) et prefixe media
  (videos), qui n'evoluent pas au meme rythme.
- Alternative ecartee : gestionnaire d'assets Webflow (pas de dossiers, pas de
  versionnement, upload manuel) — insuffisant si migration vers rendu canvas
  (centaines d'images).
- Alternative equivalente retenue en secours : Cloudflare R2 (meme principe,
  `wrangler` a la place de `curl`).

Detail complet : [`docs/hosting.md`](../hosting.md).
