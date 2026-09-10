# Le decoupage de chaque video vit sur la balise

- Date : 2026-08-27
- Statut : Adopte

## Contexte

Chaque use-case a son propre fichier, son image de transition (fin du
scrub / debut de la boucle) et sa fin de boucle. Ces valeurs pouvaient
vivre dans `src/config.js` — plus simple a lire dans le depot, mais
chaque ajout ou retouche de video aurait force un rebuild, un tag, et
une mise a jour des extraits Webflow.

## Decision

Le decoupage se pose **sur la balise `<video>`** dans le DOM, via les
attributs `data-vb-file`, `data-vb-transition` et `data-vb-end`.
`src/config.js` ne garde que les reglages globaux (fondus, largeurs,
`latchLoop`, breakpoint compact). `collectVideos()` les lit au
demarrage.

Ajouter un use-case, c'est ajouter une `<video>` et un bouton dans le
Designer — aucun rebuild.

## Consequences

- Source de verite unique : le DOM de la page, pas le depot.
- Changer `data-vb-transition` suppose toujours de reencoder (plage
  all-intra) ; seul le *lieu* de la valeur a bouge, pas la contrainte.
- `window.SCROLL_VIDEO_CONFIG` surcharge les globaux sans rebuild, mais
  pas le decoupage d'une video.
