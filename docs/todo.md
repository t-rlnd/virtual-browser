# Todo

## En cours

## À faire
- [ ] Héros : obtenir un master ≥ 1920 px (celui du proto fait 1280), `./scripts/export.sh masters/hero.mp4`, puis `upload-bunny.sh` + `check-cdn.sh` — P1
- [ ] Héros dans le Designer Webflow (structure `docs/webflow-setup.md` §0), ajouter SplitText au footer, puis `pnpm build` + tag — P1
- [ ] Dans le Designer Webflow : poser le bouton `data-vb-pause` (+ icônes `data-vb-pause-icon="pause"` / `"play"`) dans `data-vb-overlay`, puis passer head/footer sur `@v1.9.0` — P1
- [ ] Dans le Designer Webflow : tablette/mobile (< 991 px), intro et demo en relative empilées, opacités à 1, piste en hauteur auto (plus de sticky 300vh) — P1
- [ ] Remettre les deux URL jsDelivr (retirer `http://localhost:3000`) dans le site Webflow avant toute publication en production — P1
- [ ] Comparer `latchLoop: false` face à `latchLoop: true` (validé) sur le site Webflow — juger la remontée (progress, titre, dock, rétroactivité du use-case) — P2
- [ ] Réévaluer `jumpFadeMs` avec les vraies vidéos (clignement 150 ms vs cut sec vs rembobinage accéléré au passage loop → scrub) — P3

## Fait
- [x] Attributs `data-vb-*` alignés sur le markup Webflow (`data-vb-id`, `data-vb-switch`, `data-vb-visible-on`, ids `uc1`/`uc2`)
- [x] Dans le Designer Webflow : dupliquer cards et légende, poser `data-vb-visible-on="uc1"` / `"uc2"` sur chaque wrapper
- [x] Montage superposé de la section `#pin3` (scrub + boucle, deux use-cases) — développé, testé, fusionné sur `main`
- [x] Course dans `Mp4VideoLayer.unlock()` qui figeait la vidéo entrante au premier clic — corrigée
