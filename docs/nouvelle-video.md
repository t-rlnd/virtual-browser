# Remplacer une video

A transmettre au client. Deux choses seulement sont vraiment contraignantes :
le master doit sortir du montage avec les bonnes proprietes, et les fichiers
produits doivent arriver sur Bunny sans etre touches.

## Qui fait quoi

| Cas | Le client fournit | Qui lance l'outil |
| --- | --- | --- |
| Le client n'a pas de developpeur | le master, tel qu'il sort du montage | nous |
| Le client a un developpeur | rien, il fait tout | lui |

Dans le premier cas — le plus courant — le client n'a rien a installer. Il
envoie un fichier, il recoit un dossier a deposer sur Bunny, ou nous le
deposons pour lui. Seule la section suivante le concerne.

## Ce que doit respecter le master

C'est la partie a faire suivre au monteur. Rien ici n'est negociable : chaque
ligne correspond a un controle automatique qui refuse le fichier.

| Propriete | Exigence | Pourquoi |
| --- | --- | --- |
| Format | MP4 (H.264) ou MOV (ProRes) | Ce que ffmpeg reencodera |
| Definition | **1920x1080 minimum** | Nous produisons une version 1920 ; partir plus petit serait un agrandissement |
| Cadence | **30 images/seconde, constante** | Le decoupage se declare en numeros d'image ; une cadence variable fait deriver toute la synchronisation |
| Proportions | 16/9 ou plus large | Le fond est plein ecran et recadre en `cover` ; plus etroit se fait rogner |
| Rotation | aucune rotation en metadonnees | Un export brut de telephone sort couche |
| Son | inutile | Il est retire, il empecherait la lecture automatique |
| Duree | au moins **4 secondes** sur la partie pilotee au scroll | En deca, le defilement fait avancer l'image par a-coups |

Deux precisions qui ne se voient pas dans un tableau :

**La boucle doit raccorder.** La fin de la video est lue en boucle. Si la
derniere image ne ressemble pas a celle qui reprend, un saut sera visible a
chaque tour. C'est un travail de montage, aucun outil ne le rattrape.

**Les videos qui s'echangent doivent etre jumelles.** Les deux use-cases se
substituent l'un a l'autre en cours de defilement : meme definition, meme
cadence, meme cadrage. Sinon la bascule saute.

## Le point de bascule

La video se comporte en deux temps : une premiere partie **pilotee par le
scroll**, une seconde **jouee en boucle**. Il faut dire ou passer de l'une a
l'autre — un timecode suffit, nous le convertissons.

Ce choix peut se faire plus tard. Sans lui, l'export reste modifiable : le
point de bascule devient un simple reglage dans Webflow, sans reencodage. Le
prix est le poids, environ trois fois le fichier final. Confortable pour
arbitrer devant la vraie page, a refaire une fois le choix arrete.

## Lancer l'outil

Pour un developpeur, sur macOS ou Linux :

```bash
brew install ffmpeg          # une fois
./scripts/export.sh masters/video3.mp4
```

Avec le point de bascule connu, en numeros d'image (fin du scrub, fin de la
boucle) :

```bash
./scripts/export.sh masters/video3.mp4:166:398
```

L'outil controle le master, refuse d'encoder s'il sort des clous, produit
`exports/video3/` et controle a nouveau le resultat. Il imprime en fin de
course tout ce qui reste a faire.

## Deposer sur Bunny

Le dossier `exports/video3/` contient six fichiers : trois videos et leurs
images fixes.

| Fichier | Definition | Sert |
| --- | --- | --- |
| `video3-1920.mp4` | 1920x1080 | ordinateurs |
| `video3-1280.mp4` | 1280x720 | portables, tablettes |
| `video3-750.mp4` | 750x422 | telephones |

Ils se deposent **a plat** dans la Storage Zone, sous `scroll-video/v1/`, a
cote des fichiers deja presents. Pas de sous-dossier.

## Poser les attributs dans Webflow

L'outil imprime la ligne exacte. Elle se traduit par trois attributs, dans
**Settings (D) > Custom attributes** de la balise video concernee :

| Attribut | Valeur |
| --- | --- |
| `data-vb-file` | `video3` — le nom du fichier, sans largeur ni extension |
| `data-vb-transition` | numero de l'image ou le scroll rend la main a la boucle |
| `data-vb-end` | numero de la derniere image de la boucle |

Le reste de la structure ne bouge pas. Voir
[`webflow-setup.md`](webflow-setup.md).

## A ne jamais faire

- **Renommer les fichiers exportes.** Le lecteur construit ses adresses a
  partir des largeurs : `video3-1280.mp4` et rien d'autre. Un fichier renomme
  est un fichier introuvable.
- **Passer par Bunny Stream ou Cloudflare Stream.** Ces services transcodent
  en streaming adaptatif, ce qui rend le positionnement dans la video
  imprecis et casse le pilotage au scroll. Il faut du MP4 brut sur du
  stockage simple. Voir [`hosting.md`](hosting.md).
- **Recompresser les fichiers exportes.** Ils sont encodes d'une facon tres
  particuliere, qui est exactement ce qui rend le defilement fluide. N'importe
  quel reencodage la detruit.
- **Deplacer `data-vb-transition` au-dela de la plage prevue** sans refaire
  l'export. Au-dela, le defilement saute.

En cas de doute sur un fichier, avant ou apres export :

```bash
./scripts/check-video.sh masters/video3.mp4
./scripts/check-video.sh exports/video3
```
