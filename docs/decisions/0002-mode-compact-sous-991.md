# Couper le scrub sous 991 px

- Date : 2026-08-27
- Statut : Adopte

## Contexte

Le montage superpose (intro et demo en `absolute` dans un conteneur colle,
course de scrub de 300 vh) ne tient pas sur tablette et mobile : trop peu
de hauteur, les deux sous-sections doivent se succeder dans le flux.

## Decision

En dessous du breakpoint tablette Webflow (`max-width: 991px`) :

- pas de ScrollTrigger, pas de scrub, pas de trajet plein ecran → cadre ;
- `prot intro` et `prot demo` sont `relative`, l'une sous l'autre (layout
  pose par la page / le Designer) ;
- la video entre directement en `loop` sur son segment `transition` → `end`,
  deja calee dans `[data-vb-frame]` (`progress` figee a 1) ;
- les use-cases restent cliquables (fondu, barres d'avancee) ;
- hors ecran, le mode passe a `idle` (plus de decode) ; y revenir relance
  la boucle.

Le script publie `data-vb-compact="true"` sur `<html>`. Le breakpoint se
regle par `compactMaxWidth` dans `src/config.js`.

## Consequences

- La page **doit** forcer les opacites d'intro et de demo a 1 sous 991 px :
  `--vb-scrub` valant 1, les formules desktop masqueraient le titre.
- Le layout empile (plus de sticky 300 vh) est du ressort du Designer, pas
  de la feuille de style du script.
- Le Stage et les use-cases ne changent pas : seul le cablage amont
  (`playback.js` → `compact.js` ou `scroll.js`) change.
