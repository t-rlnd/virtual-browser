# Todo

## En cours

## À faire
- [ ] Dans le Designer Webflow : tablette/mobile (< 991 px), intro et demo en relative empilées, opacités à 1, piste en hauteur auto (plus de sticky 300vh) — P1
- [ ] Remettre les deux URL jsDelivr (retirer `http://localhost:3000`) dans le site Webflow avant toute publication en production — P1
- [ ] Comparer `latchLoop: false` face à `latchLoop: true` (validé) sur le site Webflow — juger la remontée (progress, titre, dock, rétroactivité du use-case) — P2
- [ ] Réévaluer `jumpFadeMs` avec les vraies vidéos (clignement 150 ms vs cut sec vs rembobinage accéléré au passage loop → scrub) — P3

## Fait
- [x] Attributs `data-vb-*` alignés sur le markup Webflow (`data-vb-id`, `data-vb-switch`, `data-vb-visible-on`, ids `uc1`/`uc2`)
- [x] Dans le Designer Webflow : dupliquer cards et légende, poser `data-vb-visible-on="uc1"` / `"uc2"` sur chaque wrapper
- [x] Montage superposé de la section `#pin3` (scrub + boucle, deux use-cases) — développé, testé, fusionné sur `main`
- [x] Course dans `Mp4VideoLayer.unlock()` qui figeait la vidéo entrante au premier clic — corrigée
