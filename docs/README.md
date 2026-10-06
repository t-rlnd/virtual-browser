# Documentation

| Je veux… | Page |
| --- | --- |
| Comprendre ce que fait le site, section par section | [`fonctionnement.md`](fonctionnement.md) |
| Comprendre comment le code est organisé | [`architecture.md`](architecture.md) |
| Changer un réglage (nombre de tours, fondu, inertie du scroll…) | [`configuration.md`](configuration.md) |
| Ajouter ou remplacer une vidéo (comprimer, Bunny, Webflow) | [`videos.md`](videos.md) |
| Construire ou modifier la page dans le Designer Webflow | [`webflow-setup.md`](webflow-setup.md) |
| Publier le code, recréer l'hébergement du bundle | [`hosting.md`](hosting.md) |
| Lancer les tests | [`tests.md`](tests.md) |
| Reprendre le projet ou le transmettre (comptes, hôtes en dur) | [`passation.md`](passation.md) |
| Savoir pourquoi un choix a été fait | [`decisions/`](decisions/), une fiche par décision |
| Voir ce qui a été fait, et quand | [`history/`](history/), un fichier par jour |
| Un mot inconnu (scrub, all-intra, sticky…) | [`glossaire.md`](glossaire.md) |

Vocabulaire : le projet s'appelle `virtual-browser` (dépôt, hébergements),
ses attributs sont `data-vb-*`. Le nom `scroll-video` qui subsiste dans le
code (`window.SCROLL_VIDEO_CONFIG`, `window.scrollVideo`, préfixe des logs)
est l'ancien nom, conservé parce que le changer casserait Webflow.
