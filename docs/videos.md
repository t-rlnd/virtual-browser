# Préparer et mettre en ligne les vidéos

Le côté technique du pipeline vidéo. La version à transmettre à un client est
[`nouvelle-video.md`](nouvelle-video.md) ; l'hébergement est détaillé dans
[`hosting.md`](hosting.md).

Prérequis : `brew install ffmpeg`.

## Pourquoi un encodage particulier

Le scrub enchaîne des dizaines de sauts (seeks) par seconde dans la vidéo. Un
MP4 classique ne stocke une image complète que toutes les quelques secondes :
chaque saut oblige le navigateur à recalculer depuis la dernière image
complète, et l'image saccade. Les scripts encodent donc la partie scrubbée en
**all-intra** — chaque image est complète (voir le [glossaire](glossaire.md)).
La partie en boucle, lue normalement, reste compressée classiquement.

## Le chemin court : une commande par vidéo

```bash
./scripts/export.sh masters/video3.mp4:166:398
```

`166` = image où le scrub s'arrête et la boucle commence, `398` = dernière
image de la boucle. Toujours en **numéros d'image**, jamais en secondes.

`export.sh` enchaîne trois étapes et s'arrête à la première erreur :

1. `check-video.sh` contrôle le master ;
2. `encode.sh` encode chaque largeur ;
3. `check-video.sh` contrôle le résultat.

Il sort `exports/video3/` :

| Fichier | Définition | Pour |
| --- | --- | --- |
| `video3-1920.mp4` + `-poster.jpg` | 1920×1080 | ordinateurs |
| `video3-1280.mp4` + `-poster.jpg` | 1280×720 | portables, tablettes |
| `video3-750.mp4` + `-poster.jpg` | 750×422 | mobiles |

Ces fichiers se déposent **à plat** sur Bunny, sous `scroll-video/v1/`. Le
script imprime en fin de course le chemin exact, la commande de vérification
du CDN et les attributs à coller dans le Designer.

**Les noms de fichiers sont un contrat** : le script construit ses URL à partir
de `data-vb-asset` et des largeurs (`widths` dans
[`src/config.js`](../src/config.js)). Un fichier renommé est introuvable.

## Avec ou sans découpage

Sans découpage (`./scripts/export.sh masters/video3.mp4`), **tout** le fichier
sort en all-intra : n'importe quel `data-vb-loop-at` fonctionne, et on peut le
déplacer plus tard dans Webflow sans réencoder. Pratique pour choisir le point
de bascule devant la vraie page, mais environ trois fois plus lourd.

Une fois le point de bascule arrêté, relancer avec `:start:end` pour revenir
au poids normal. Tant que le contrôle de poids proteste, c'est qu'on paie
encore l'all-intra sur toute la longueur.

⚠️ Déplacer `data-vb-loop-at` **au-delà** de la plage encodée en all-intra fait
saccader le scrub : il faut réencoder.

## Les standards vérifiés

`check-video.sh` s'utilise aussi seul :

```bash
./scripts/check-video.sh masters/video3.mp4:166:398   # le master est-il utilisable ?
./scripts/check-video.sh public/assets                # l'encodage est-il servable ?
```

Il lit la cadence et les largeurs dans [`src/config.js`](../src/config.js) :
changer la config change ce qu'il exige.

| Ce qu'il exige d'un master | Pourquoi |
| --- | --- |
| Cadence constante | Le découpage est en numéros d'image ; une cadence variable fausse la conversion en secondes |
| Cadence égale à `config.fps` (30) | Sinon la balise doit porter `data-vb-fps` |
| Largeur ≥ la plus grande largeur encodée | Sinon on agrandirait l'image |
| Format ≥ 16/9 | Le plein écran recadre en `cover` : plus étroit, l'image est rognée |
| Aucune rotation en métadonnées | Le script ne la lit pas, l'image sortirait couchée |
| Plage scrubbée assez longue | Au-delà de 20 px de scroll par image, le scrub se voit par à-coups |
| Géométrie identique entre masters | Les vidéos s'échangent à chaud : un saut de cadrage se verrait |

| Ce qu'il exige d'un encodage | Pourquoi |
| --- | --- |
| Plage all-intra en tête | Seeks instantanés ; le script en déduit le `data-vb-loop-at` maximal |
| `moov` avant `mdat` (faststart) | Sinon le premier seek attend le fichier entier |
| yuv420p 8 bits, level ≤ 4.1 | Ce que décodent Safari et les appareils anciens |
| Aucune piste audio | Elle bloque l'autoplay et pèse pour rien |
| Jeu de largeurs complet + poster | Le script demande une largeur précise ; le poster sert de repli `prefers-reduced-motion` |
| Poids sous budget | 4 Mo par tranche de 1000 px de large (`MB_PER_1000PX` pour l'ajuster) |

Quand la densité le permet, le script propose `SCRUB_DIVISOR=2` (une image
all-intra sur deux), environ 40 % plus léger.

## Les scripts, un par un

Utiles pour aller plus loin que `export.sh` :

```bash
./scripts/probe.sh masters/*.mp4                          # inspecter les masters
./scripts/encode.sh masters/video1.mp4:166:398 ...        # encoder vers public/assets
./scripts/check-video.sh public/assets                    # contrôler ce qui sera téléversé

export BUNNY_STORAGE_ZONE=ma-zone BUNNY_STORAGE_KEY=xxxxxxxx
./scripts/upload-bunny.sh                                  # téléverser public/assets sur Bunny

./scripts/check-cdn.sh https://ma-zone.b-cdn.net/scroll-video/v1/video1-1280.mp4
                                                           # le CDN sert-il du MP4 brut, avec Range et CORS ?
```

## Publier de nouvelles versions des vidéos

Ne pas écraser des fichiers déjà en ligne puis purger le cache : incrémenter
le préfixe (`scroll-video/v1/` → `v2/`), mettre à jour `base` dans
[`src/config.js`](../src/config.js), puis publier une nouvelle version du code.
Voir [`hosting.md`](hosting.md#versionner-le-prefixe-des-medias-plutot-que-purger-le-cache).
