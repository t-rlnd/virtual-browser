# Section Héros : module indépendant, même bundle

- Date : 2026-09-28
- Statut : Adopté

## Contexte

Une section Héros s'ajoute au-dessus de Protocol : vidéo de fond scrubbée
par le scroll, H1 + paragraphe fixes qui changent à 1/3 et 2/3 de la
vidéo, bascule animée ligne par ligne. Un prototype React
(`virtual-browser-proto`) validait l'idée mais pilotait `currentTime`
depuis une boucle rAF permanente, avec un verrou de seek à durée fixe
(90 ms) et un changement de texte racé.

## Décision

- **Module à part (`src/hero.js`), même bundle.** Le Héros n'a ni boucle
  ni use-case : le faire passer par le `Stage` n'apporterait que de la
  complexité. Il partage seulement `Mp4VideoLayer` (file de seeks tenue
  sous Safari) et le déblocage iOS (`src/unlock.js`). Livré dans
  `dist/scroll-video.js` : aucun nouveau script à coller, et une page
  peut porter l'un, l'autre ou les deux.
- **Les textes vivent dans le conteneur collé**, empilés dans la même
  cellule de grille. La pile prend la hauteur du plus long : le titre ne
  bouge jamais. Pas de sous-sections pour découper la piste : les seuils
  se calculent sur la progression.
- **Scrub conservé sous 991 px**, contrairement à Protocol
  ([0002](0002-mode-compact-sous-991.md)) : un seul segment, pas de
  recadrage, et une vidéo all-intra qui tient sur mobile récent.
- **SplitText (GSAP, gratuit depuis 3.13)** découpe titres et paragraphes
  en lignes masquées, animées avec un stagger. Chargé depuis jsDelivr
  comme GSAP ; absent, les blocs basculent d'un seul tenant.
- **Bascule non liée au scroll** : l'animation est une timeline de durée
  fixe déclenchée au franchissement du seuil, pas une interpolation. Une
  bascule qui arrive pendant une autre pose l'étape visée d'un coup et
  repart de là : jamais deux blocs à moitié visibles.
- **Vidéo sur Bunny**, même préfixe `scroll-video/v1/` (fichier nouveau,
  pas de conflit de cache), fichier `hero-<largeur>.mp4` entièrement
  all-intra puisque toute la vidéo est scrubbée.

## Conséquences

- `webflow/footer.html` charge `SplitText.min.js` après ScrollTrigger.
- Le vrai `<h1>` (étape 0) et les `.h1` des étapes suivantes doivent
  partager exactement le même style, marges comprises, sinon le titre
  saute (vérifié par l'e2e, étape 27).
- `window.scrollVideoHero` expose la section, à côté de `window.scrollVideo`.
- La visibilité des blocs est posée en style direct, pas via `gsap.set` :
  plusieurs `set` du même élément dans un tick pouvaient être différés et
  laisser le premier texte masqué dans le bundle.
