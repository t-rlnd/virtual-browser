# Smooth scroll Lenis et bundle unique `index.*` pour tout le site

- Date : 2026-09-30
- Statut : Adopte

## Contexte

On veut un smooth scroll sur tout le site Webflow, pas seulement sur la home.
Le bundle `scroll-video.*` n'etait colle que sur la home (Heros + Protocol).
Option envisagee : plusieurs fichiers charges selon la page (smooth partout,
Heros et Protocol sur la home).

## Decision

- **Un seul bundle, renomme `index.js` / `index.css`**, colle dans les Site
  settings (toutes les pages). Chaque module ne s'active que si sa structure
  est dans le DOM : Lenis partout, Heros sur `[data-vb-hero]`, Protocol sur
  `[data-vb-stage]` + `[data-vb-scrub]`. Le chargement conditionnel par page a
  ete ecarte : le bundle pese ~14 Ko gzip, Lenis compris, pour un gain nul et
  une gestion page par page dans Webflow.
- **Lenis bundle depuis npm** (pas de CDN supplementaire), sur le ticker GSAP
  (`gsap.ticker.add` + `lagSmoothing(0)`) et `lenis.on('scroll',
  ScrollTrigger.update)`. Sans GSAP sur la page, Lenis tourne sur sa propre
  boucle (`autoRaf`).
- Coupe en `prefers-reduced-motion` ; tactile non lisse (defaut Lenis).
- `scrubSmoothing` passe de 0.4 a 0.1 : l'inertie de Lenis s'additionnait a
  celle du scrub.
- Les sauts instantanes (collapse de la piste au verrou, `scroll.js`) passent
  par `jumpTo()` : un `window.scrollTo` seul serait annule par Lenis, qui
  reprendrait sa course vers la cible en cours.
- `data-vb-state="absent"` sur une page sans Protocol, sans avertissement :
  c'est le cas normal, plus une erreur.

## Consequences

- Webflow : retirer les snippets des Page settings de la home, les coller
  dans les Site settings.
- Les anciennes URL `scroll-video.*` restent servies par reecriture Netlify.
- Un bloc a scroll interne (modale...) doit porter `data-lenis-prevent`.
- `scrubSmoothing` et `lenis.lerp` sont a ajuster au ressenti, surchargeables
  sans rebuild via `window.SCROLL_VIDEO_CONFIG`.
