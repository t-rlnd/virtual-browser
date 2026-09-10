# Collapser la piste une fois le verrou armé

- Date : 2026-09-10
- Statut : Adopté

## Contexte

La piste `[data-vb-scrub]` mesure ~300vh pour créer la course de scrub
(plus `loopReserve`). Une fois la boucle atteinte, `latchLoop: true`
fige la mise en scène : remonter ne rembobine plus. Ces 200vh deviennent
du scroll mort — rien ne change à l'écran. Cacher l'Intro n'y change
rien : elle est en `absolute`, elle ne tient pas la hauteur.

Un `height: 100dvh` posé au moment du loop, sans JS, casse le sticky :
on a déjà parcouru ~100vh dans la piste ; si elle rétrécit par le bas,
`scrollY` se retrouve au-delà et UseCase part vers le haut.

## Décision

Quand le verrou s'arme (`enterLoop` dans `src/scroll.js`, ou reload
déjà au-delà du scrub) :

1. poser `data-vb-latched="true"` sur `<html>` ;
2. forcer `[data-vb-scrub]` à `100dvh` (inline, pour gagner même si
   Webflow a posé `300vh` en style) ;
3. recaler `scrollY` : sur `offsetTop` si UseCase est sous les yeux,
   retrancher le delta de hauteur si on a rechargé plus bas ;
4. `ScrollTrigger.refresh()` (reporté d'une frame quand on vient de
   `onLeave`, pour ne pas réentrer dans le tick en cours).

Le signal est `data-vb-latched`, pas `data-vb-mode`. En sortant de la
section le mode passe à `idle` : accrocher le collapse au mode
retendrait la piste à 300vh et ferait sauter toute la page.

`latchLoop: false` : on ne collapse pas — il resterait une course pour
rembobiner. Compact (< 991 px) : no-op, la piste est déjà en
`height: auto`.

`loopReserve` reste utile **pendant** le scrub (c'est lui qui décide
quand `onLeave` arme la boucle). Une fois collapsé, il ne crée plus de
course : la suite du site colle sous UseCase.

## Conséquences

- Côté Designer : aucune hauteur à changer. Garder 300vh sur Protocol ;
  le script la passe à 100dvh tout seul.
- L'inner sticky doit rester dans la même unité (`100dvh`) pour éviter
  un reliquat iOS `vh` ≠ `dvh`.
- Masquer l'Intro (`:root[data-vb-latched] .protocol_intro { display:
  none }`) reste un choix de page, orthogonal.
- Les tests e2e relisent la géométrie **après** le collapse :
  `scrubEnd` / `unpin` calculés au chargement sont périmés.
