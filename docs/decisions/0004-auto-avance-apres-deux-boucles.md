# Auto-avance après deux tours de boucle

- Date : 2026-09-10
- Statut : Adopté

## Contexte

La lecture autonome sur le segment boucle n'avait pas de fin : la vidéo
active tournait jusqu'à un clic ou jusqu'à ce que la section quitte
l'écran. Il faut maintenant montrer chaque use-case tout seul, tout en
laissant le clic manuel prioritaire.

## Décision

`loopRepeats: 2` dans `src/config.js` (surchargeable via
`window.SCROLL_VIDEO_CONFIG`). En mode `loop`, le Stage compte les tours
du segment boucle. Au 2e tour il appelle `setActive` sur le use-case
suivant, dans l'ordre DOM des `[data-vb-video]`, et revient au premier
après le dernier.

La couche notifie la fin d'un tour (`playLoop(start, end, onCycle)`).
Elle seule voit le seek de rebouclage. Un retour `false` fige la dernière
image : le fondu vers la suivante part de là, pas d'un flash du début de
segment.

Le compteur se remet à zéro à chaque entrée en `loop` et à chaque
bascule (clic ou auto-avance). `refresh()` ne le touche pas : le
déblocage iOS rejoue l'état, il ne recommence pas les tours.

Une seule vidéo dans le DOM : on continue à boucler. `loopRepeats:
Infinity` restaure l'ancien comportement.

## Conséquences

- `activeId` n'est plus muté uniquement au clic : le Stage le change
  aussi en fin de boucle. `usecases.js` reste l'UI, il reflète
  `activechange` dans les deux cas.
- Le scrub n'est pas compté. Compact et desktop partagent la même règle,
  c'est le mode `loop` qui déclenche, pas le câblage.
- Les boutons `[data-vb-usecase]` ne changent pas.
- La barre `[data-vb-progress]` couvre la serie de tours (0 → 100 % au
  dernier), pas un tour isole. En `loopRepeats: Infinity`, elle rembobine
  encore a chaque passage.
