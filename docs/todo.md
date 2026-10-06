# Todo

## En cours

## À faire
- [ ] Webflow : retirer head/footer des Page settings de la home, coller webflow/head.html et footer.html dans les Site settings (bundle index.* + Lenis) — P1
- [ ] Ajuster au ressenti `scrubSmoothing` (0.1) et `lenis.lerp` (0.1) sur le site — P2
- [ ] Dans le Designer Webflow : poser le bouton `data-vb-pause` (+ icônes `data-vb-pause-icon="pause"` / `"play"`) dans `data-vb-overlay` — P1
- [ ] Dans le Designer Webflow : tablette/mobile (< 991 px), intro et demo en relative empilées, opacités à 1, piste en hauteur auto (plus de sticky 300vh) — P1
- [ ] Retrouver les masters `video1` et `video2` (seul `hero.mp4` est dans `masters/`) et les remettre au client — P1

## Fait
- [x] Verrou de boucle définitif : voie `latchLoop: false` et `jumpFadeMs` retirées (ADR 0011)
- [x] Pipeline vidéo unifié : `export.sh` → `exports/<nom>/` → `upload-bunny.sh <dossier>`, `probe.sh` et `public/assets` retirés, doc unique `videos.md`
- [x] Héros posé dans le Designer Webflow et vérifié en `?dev`
- [x] Vidéo Héros 1920 encodée (1 image sur 3, CRF 28) et téléversée sur Bunny, vérifiée par `check-cdn.sh`
- [x] Attributs `data-vb-*` alignés sur le markup Webflow (`data-vb-id`, `data-vb-switch`, `data-vb-visible-on`, ids `uc1`/`uc2`)
- [x] Dans le Designer Webflow : dupliquer cards et légende, poser `data-vb-visible-on="uc1"` / `"uc2"` sur chaque wrapper
- [x] Montage superposé de la section `#pin3` (scrub + boucle, deux use-cases) — développé, testé, fusionné sur `main`
- [x] Course dans `Mp4VideoLayer.unlock()` qui figeait la vidéo entrante au premier clic — corrigée
