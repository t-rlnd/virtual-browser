# Vidéos : comprimer, stocker sur Bunny, servir dans Webflow

Tout le pipeline vidéo, de bout en bout. Trois étapes, une commande pour
chacune. Un mot inconnu (scrub, all-intra, poster…) ? Voir le
[glossaire](glossaire.md).

Prérequis, une fois : `brew install ffmpeg`.

```bash
./scripts/export.sh masters/video3.mp4:166:398    # 1. comprimer  → exports/video3/
./scripts/upload-bunny.sh exports/video3           # 2. stocker    → Bunny, home/v1/
# 3. servir : poser les attributs imprimés par export.sh sur la <video> dans Webflow
```

Le découpage `:166:398` se donne en **numéros d'image**, jamais en secondes :
`166` = image où le scrub s'arrête et la boucle commence, `398` = dernière
image de la boucle. La vidéo du Héros, qui ne boucle pas, s'exporte sans
découpage (voir [Cas particulier : le Héros](#cas-particulier--le-héros)).

---

## 0. Ce que doit respecter le master

À faire suivre au monteur. Chaque ligne correspond à un contrôle automatique
qui **refuse** le fichier.

| Propriété | Exigence | Pourquoi |
| --- | --- | --- |
| Format | MP4 (H.264) ou MOV (ProRes) | Ce que ffmpeg ré-encodera |
| Définition | **1920×1080 minimum** | On produit une version 1920 ; partir plus petit serait un agrandissement |
| Cadence | **30 images/seconde, constante** | Le découpage se déclare en numéros d'image ; une cadence variable fait dériver la synchronisation |
| Proportions | 16/9 ou plus large | Le fond est plein écran et recadré en `cover` ; plus étroit se fait rogner |
| Rotation | aucune en métadonnées | Un export brut de téléphone sort couché |
| Son | inutile | Retiré à l'encodage, il empêcherait la lecture automatique |
| Durée scrubbée | **4 secondes minimum** | En deçà, le scroll fait avancer l'image par à-coups |

Deux points qui ne tiennent pas dans un tableau :

- **La boucle doit raccorder.** La fin de la vidéo est lue en boucle. Si la
  dernière image ne ressemble pas à celle qui reprend, un saut se verra à
  chaque tour. C'est un travail de montage, aucun outil ne le rattrape.
- **Les vidéos qui s'échangent doivent être jumelles.** Les use-cases se
  substituent l'un à l'autre à chaud : même définition, même cadence, même
  cadrage. Sinon la bascule saute.

Les masters ne sont **ni dans git ni conservés par l'agence** (`masters/` est
ignoré) : ils restent chez le client, seuls eux permettent de ré-encoder. Sur
Bunny ne vivent que les exports.

---

## 1. Comprimer

### Pourquoi un encodage particulier

Le scrub enchaîne des dizaines de sauts par seconde dans la vidéo. Un MP4
classique ne stocke une image complète que toutes les quelques secondes :
chaque saut oblige le navigateur à recalculer depuis la dernière image
complète, et ça saccade. La partie scrubbée est donc encodée en **all-intra**
(chaque image est complète) ; la partie en boucle, lue normalement, reste
compressée classiquement. C'est pour ça qu'un fichier **ne doit jamais être
recompressé** après export : n'importe quel ré-encodage détruit cette propriété.

### La commande

```bash
./scripts/export.sh masters/video3.mp4:166:398
```

Elle enchaîne trois contrôles et s'arrête à la première erreur : le master
tient-il les standards, encodage de chaque largeur, le résultat est-il
servable. Elle sort `exports/video3/` :

| Fichier | Définition | Pour |
| --- | --- | --- |
| `video3-1920.mp4` + `video3-1920-poster.jpg` | 1920×1080 | ordinateurs |
| `video3-1280.mp4` + `video3-1280-poster.jpg` | 1280×720 | portables, tablettes |
| `video3-750.mp4` + `video3-750-poster.jpg` | 750×422 | téléphones |

Les largeurs viennent de `widths` dans [`src/config.js`](../src/config.js), la
seule source de vérité : le lecteur demande exactement ces fichiers. **Ne
jamais renommer un fichier exporté**, il deviendrait introuvable.

En fin de course, le script imprime les deux étapes suivantes : la commande
de téléversement et les attributs à poser dans Webflow.

### Sans découpage connu

```bash
./scripts/export.sh masters/video3.mp4
```

Tout le fichier sort en all-intra : n'importe quel `data-vb-loop-at`
fonctionne, et on peut le déplacer dans Webflow sans ré-encoder. Pratique
pour choisir le point de bascule devant la vraie page, mais environ **trois
fois plus lourd**. Une fois le choix arrêté, relancer avec `:start:end`.

⚠️ Déplacer `data-vb-loop-at` **au-delà** de la plage encodée en all-intra
fait saccader le scrub : il faut ré-exporter.

### Cas particulier : le Héros

La vidéo du Héros est scrubbée de bout en bout et ne boucle pas : elle
s'exporte **sans découpage**, donc entièrement all-intra. Sa piste étant
longue (400vh), on peut ne garder qu'une image sur trois sans que le scrub
se voie, ce qui divise le poids d'autant :

```bash
SCRUB_DIVISOR=3 CRF=28 ./scripts/export.sh masters/hero.mp4
```

Le script avertira sur le poids (budget calculé pour une vidéo Protocol) :
c'est attendu.

### Réglages utiles

| Variable | Défaut | Effet |
| --- | --- | --- |
| `CRF` | `24` | Qualité : plus bas = meilleur et plus lourd |
| `SCRUB_DIVISOR` | `1` | Ne garde qu'une image sur N dans la plage scrubbée (`2` ≈ 40 % plus léger). Le script indique quand c'est possible sans à-coups |
| `WIDTHS` | celles de `config.js` | Ne pas changer sans changer `config.js` : sinon 404 |

Contrôler un fichier à part, avant ou après export :

```bash
./scripts/check-video.sh masters/video3.mp4:166:398   # le master est-il utilisable ?
./scripts/check-video.sh exports/video3               # l'export est-il servable ?
```

---

## 2. Stocker sur Bunny

### La règle qui prime sur tout

Les MP4 doivent être servis **bruts**, depuis un simple stockage derrière un
CDN. **Jamais Bunny Stream, jamais Cloudflare Stream** : ces services
transcodent en streaming adaptatif (HLS), ce qui rend la position dans la
vidéo imprécise et casse le scrub.

### La zone (une fois)

1. Créer une **Storage Zone** (région proche de l'audience).
2. Créer une **Pull Zone** branchée dessus. Son hôte (`xxx.b-cdn.net` ou un
   domaine personnalisé) est la valeur de `base` dans
   [`src/config.js`](../src/config.js), suivie du préfixe (`/home/v1`).
3. Dans la Pull Zone, onglet **Headers**, ajouter
   `Access-Control-Allow-Origin: *`.
4. Récupérer le mot de passe de la Storage Zone (onglet **FTP & API Access**).
   C'est `BUNNY_STORAGE_KEY` ci-dessous. Ne jamais le commiter.

Zone actuelle : `virtual-browser` chez le client, servie sur
`virtual-browser.b-cdn.net`, fichiers sous `home/v1/`.

### Téléverser

```bash
export BUNNY_STORAGE_ZONE=virtual-browser
export BUNNY_STORAGE_KEY=xxxxxxxx
./scripts/upload-bunny.sh exports/video3
```

Le script lit l'hôte et le préfixe dans `base` (`src/config.js`) et dépose
les six fichiers **à plat**, sans sous-dossier, à côté de ceux déjà en ligne.
À la main (interface Bunny, FTP) : même chose, mêmes noms, même préfixe.

### Vérifier

```bash
./scripts/check-cdn.sh https://virtual-browser.b-cdn.net/home/v1/video3-1920.mp4
```

Trois points contrôlés : requêtes `Range` servies (sinon chaque seek
télécharge tout le fichier), CORS ouverts, et MP4 brut (pas de manifeste HLS).

### Publier une nouvelle série de vidéos

Ne pas écraser des fichiers en ligne puis purger le cache. Incrémenter le
préfixe (`home/v1` → `home/v2`) dans `base`, téléverser sous le nouveau
préfixe, puis publier le code (`pnpm build`, commit de `dist/`, push, voir
[`hosting.md`](hosting.md)). Le déploiement est atomique et l'ancienne
version reste servie tant que la nouvelle n'est pas référencée.

---

## 3. Servir dans Webflow

Le lecteur construit lui-même l'adresse de chaque fichier :

```
base  +  /  +  data-vb-asset  +  -  +  largeur  +  .mp4
https://virtual-browser.b-cdn.net/home/v1/video3-1280.mp4
```

Il choisit la largeur selon l'écran, charge le poster en repli
(`prefers-reduced-motion`), et lit le découpage **sur la balise**. Rien n'est à
compiler : ajouter ou remplacer une vidéo se fait entièrement dans le Designer.

### Protocol (use-cases)

Sur la balise `<video>` du use-case, dans **Settings (D) › Custom
attributes** (`export.sh` imprime la ligne exacte) :

| Attribut | Valeur | Rôle |
| --- | --- | --- |
| `data-vb-id` | `uc3` | Identifiant, le même que sur le bouton `data-vb-switch` |
| `data-vb-asset` | `video3` | Nom du fichier, sans largeur ni extension |
| `data-vb-loop-at` | `166` | Image où le scroll rend la main à la boucle |
| `data-vb-loop-end` | `398` | Dernière image de la boucle (à défaut : fin du fichier) |

Un nouveau use-case demande aussi un bouton `data-vb-switch="uc3"` et ses
cards `data-vb-visible-on="uc3"` : voir
[`webflow-setup.md`](webflow-setup.md#ajouter-un-3e-use-case).

### Héros

Sur la balise `<video data-vb-hero-video>` :

| Attribut | Valeur | Rôle |
| --- | --- | --- |
| `data-vb-asset` | `hero` | Nom du fichier (défaut : `hero`) |
| `data-vb-hero-end` | optionnel | Image où le scrub s'arrête ; à défaut, la fin du fichier |

### Vérifier sur le site publié

Ouvrir la console du site :

- `document.querySelector('[data-vb-hero]').dataset.vbHeroState` vaut `ready`
  (`error` = MP4 introuvable sur Bunny, vérifier `data-vb-asset` et les noms).
- `document.documentElement.dataset.vbState` vaut `ready`, et
  `window.scrollVideo.stage.activeId` renvoie le use-case affiché.
- Onglet Réseau : les MP4 viennent de `virtual-browser.b-cdn.net` avec un
  statut **206** (requêtes Range), jamais un `.m3u8`.

Un `404` sur un MP4 signifie presque toujours un nom qui ne correspond pas :
`data-vb-asset` ≠ nom du fichier, ou fichier renommé après export.

---

## À ne jamais faire

- **Renommer** les fichiers exportés.
- **Recompresser** un fichier exporté (Webflow, un outil en ligne, HandBrake…).
- **Passer par Bunny Stream ou Cloudflare Stream.**
- **Déplacer `data-vb-loop-at` au-delà** de la plage all-intra sans ré-exporter.
- **Changer `widths` ou `base`** dans `config.js` sans rebuild + push du code.
