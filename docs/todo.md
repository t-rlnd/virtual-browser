# Todo

## En cours

## À faire
- [ ] Webflow : recoller head.html et footer.html (URL Netlify + règle anti-flash du Héros) — P1
- [ ] Dans le Designer Webflow : poser le bouton `data-vb-pause` (+ icônes `data-vb-pause-icon="pause"` / `"play"`) dans `data-vb-overlay` — P1
- [ ] Dans le Designer Webflow : tablette/mobile (< 991 px), intro et demo en relative empilées, opacités à 1, piste en hauteur auto (plus de sticky 300vh) — P1
- [ ] Comparer `latchLoop: false` face à `latchLoop: true` (validé) sur le site Webflow — juger la remontée (progress, titre, dock, rétroactivité du use-case) — P2
- [ ] Réévaluer `jumpFadeMs` avec les vraies vidéos (clignement 150 ms vs cut sec vs rembobinage accéléré au passage loop → scrub) — P3

## Fait
- [x] Héros posé dans le Designer Webflow et vérifié en `?dev`
- [x] Vidéo Héros 1920 encodée (1 image sur 3, CRF 28) et téléversée sur Bunny, vérifiée par `check-cdn.sh`
- [x] Attributs `data-vb-*` alignés sur le markup Webflow (`data-vb-id`, `data-vb-switch`, `data-vb-visible-on`, ids `uc1`/`uc2`)
- [x] Dans le Designer Webflow : dupliquer cards et légende, poser `data-vb-visible-on="uc1"` / `"uc2"` sur chaque wrapper
- [x] Montage superposé de la section `#pin3` (scrub + boucle, deux use-cases) — développé, testé, fusionné sur `main`
- [x] Course dans `Mp4VideoLayer.unlock()` qui figeait la vidéo entrante au premier clic — corrigée
