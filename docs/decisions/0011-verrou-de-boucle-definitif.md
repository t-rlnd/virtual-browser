# Verrou de boucle définitif : retrait de `latchLoop: false`

- Date : 2026-10-06
- Statut : Adopté (précise [0005](0005-collapse-piste-apres-latch.md))

## Contexte

Depuis l'ADR 0005, `latchLoop: true` est le comportement du site : une fois la
boucle atteinte, remonter ne rembobine plus et la piste se replie à `100dvh`.
Le code gardait pourtant la voie `latchLoop: false` (aller-retour, use-case
rétroactif sur le scrub) et son clignement `jumpFadeMs` au passage boucle →
scrub. Cette voie n'a jamais été activée en production ; elle coûtait une
branche dans `scroll.js`, une transition asynchrone dans `Stage.js`, deux
tests unitaires, deux étapes e2e avec rechargement et de la documentation,
pour une comparaison (todo P2) jamais faite.

## Décision

- `latchLoop` et `jumpFadeMs` sont retirés de `src/config.js`. Le verrou
  s'arme toujours en entrant en boucle (`scroll.js`).
- `Stage._enterScrub` redevient synchrone : pause, `hardSeek` sur l'image du
  scroll, affichage. La transition boucle → scrub reste correcte dans la
  machine à états (mode compact, tests), simplement sans fondu.
- Le e2e ne recharge plus la page avec `latchLoop: false` ; les étapes de
  mise en scène qui ont besoin du scrub rechargent en haut de page.

## Conséquences

- Moins de surface : une seule mise en scène à tester et à documenter.
- Revenir à l'aller-retour demanderait de réécrire la branche, pas de
  basculer un réglage. C'est volontaire : l'option gardée « au cas où »
  n'aurait jamais été tranchée.
