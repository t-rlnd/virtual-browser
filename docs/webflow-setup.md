# Structure a construire dans le Designer Webflow

Le script ne cible que des attributs `data-vb-*`. Aucune classe Webflow n'est
referencee : le designer reste libre de renommer et restyler ce qu'il veut,
tant que les attributs restent en place.

Les attributs se posent dans le panneau **Settings (D) > Custom attributes**.

## Vue d'ensemble

```
body
├── div                       data-vb-loader          (optionnel)
├── div                       data-vb-stage           position: fixed, plein ecran
│   ├── video                 data-vb-video="v1"
│   │                         data-vb-file="video1"
│   │                         data-vb-transition="166"
│   │                         data-vb-end="398"
│   └── video                 data-vb-video="v2"
│                             data-vb-file="video2"
│                             data-vb-transition="116"
│                             data-vb-end="247"
├── section  "Intro"          data-vb-scrub           min-height: 250vh
│   └── div                   data-vb-scrub-inner     position: sticky
│       └── (titre, texte...)
├── section  "Use cases"      data-vb-loop
│   ├── div / button          data-vb-usecase="v1"
│   └── div / button          data-vb-usecase="v2"
└── (suite du site)
```

## 1. Le fond video

Un unique bloc `div` avec l'attribut `data-vb-stage`. Laisse **sans valeur**,
il est mis en `position: fixed` plein ecran par la feuille de style : son
emplacement dans la hierarchie n'a alors aucune importance visuelle, mais le
placer tout en haut du body evite les surprises d'empilement.

### Positionner le stage soi-meme

`data-vb-stage="custom"` desactive ce positionnement et rend la main au
Designer. C'est ce qu'il faut pour un fond **sticky borne a un conteneur**,
qui s'arrete a la fin de celui-ci au lieu de rester colle indefiniment :

```
div  .protocol_background       position: absolute, derriere les sections
└── div  .protocol_videos-wrapper    position: sticky, 100vw x 100vh
        data-vb-stage="custom"
    └── HTML Embed                   les balises <video>
```

Deux contraintes dans ce mode :

- le stage doit rester un **ancetre positionne** (`relative`, `absolute` ou
  `sticky`), les couches video etant en `position: absolute` a l'interieur ;
- c'est a toi de poser le fond, `background-color` n'etant plus applique.

Sans cet attribut, le `position: fixed` de la feuille de style ecraserait le
`sticky` du Designer : a specificite egale, c'est `scroll-video.css` qui gagne,
etant chargee apres le CSS de Webflow.

A l'interieur, les balises `<video>` se posent par un **HTML Embed**, pas par
l'element Video du Designer : ce dernier produit un embed Vimeo/YouTube, dans
lequel `currentTime` est inaccessible. L'element **Background video** est tout
aussi inadapte, Webflow lui imposant sa propre source et son autoplay.

Un seul HTML Embed suffit pour les deux balises :

```html
<video data-vb-video="v1" data-vb-file="video1"
       data-vb-transition="166" data-vb-end="398"
       muted playsinline preload="auto"></video>
<video data-vb-video="v2" data-vb-file="video2"
       data-vb-transition="116" data-vb-end="247"
       muted playsinline preload="auto"></video>
```

Chaque balise porte son identifiant **et** son decoupage :

| Attribut | Exemple | Role |
| --- | --- | --- |
| `data-vb-video` | `v1` | Identifiant, le meme que sur le bouton `data-vb-usecase` |
| `data-vb-file` | `video1` | Racine du fichier CDN : `video1-1280.mp4` |
| `data-vb-transition` | `166` | Numero d'image ou le scrub s'arrete et la boucle commence |
| `data-vb-end` | `398` | Derniere image de la boucle (optionnel : a defaut, fin du fichier) |

Les valeurs actuelles :

```
video v1    data-vb-transition="166"    data-vb-end="398"
video v2    data-vb-transition="116"    data-vb-end="247"
```

Ne renseigner **aucun `src`** : le script choisit lui-meme le fichier selon la
largeur du viewport et l'ecrit dans `src`. Les attributs `muted`, `playsinline`
et `preload` sont egalement poses par le script, un oubli est donc sans
consequence — ils figurent ci-dessus par simple precaution.

### Ajouter un 3e use-case

Rien a modifier dans le JavaScript. Dans le Designer :

1. Ajouter une balise `<video>` dans le meme HTML Embed.
2. Lui donner par exemple `data-vb-video="v3"`, `data-vb-file="video3"`,
   `data-vb-transition="140"` (et `data-vb-end` si la boucle ne va pas jusqu'a
   la fin du fichier).
3. Dupliquer un bouton dans la section 2 avec `data-vb-usecase="v3"`.
4. Encoder et televerser `video3-750.mp4`, `video3-1280.mp4`, `video3-1920.mp4`
   (voir `scripts/encode.sh`).

Le script decouvre les balises au chargement : la nouvelle video est scrubee
sur **sa** intro, boucle sur **son** segment, et reste sticky comme les autres.

## 2. La section scrubee

La section 1 porte `data-vb-scrub`. Sa hauteur doit depasser le viewport, sinon
il n'y a aucune course de scroll a mapper sur la video : la feuille de style
impose `min-height: 250vh`.

Son contenu visible vit dans un enfant portant `data-vb-scrub-inner`, mis en
`position: sticky; top: 0; height: 100vh`. C'est lui qui reste colle a l'ecran
pendant que la video se scrube derriere.

Le scrub **ne s'arrete pas a la fin de la section 1**. Il commence quand le haut
de la section 1 atteint le haut de l'ecran, et se poursuit pendant toute la
montee de la section 2, pour n'atteindre son terme qu'au moment ou celle-ci
occupe tout l'ecran. Concretement, la course de scroll utile vaut donc
exactement la hauteur de la section 1.

Le dernier tiers du scrub se joue ainsi pendant que le contenu colle de la
section 1 se decolle et sort par le haut, remplace par la section 2 : la video
finit son parcours 00:00 → 00:03 pile au moment ou la seconde section prend
l'ecran.

Pour allonger ou raccourcir la duree du scrub, il suffit de changer la hauteur
de la section 1 (une valeur plus grande ralentit la video par rapport au
scroll).

## 3. La section des use-cases

La section 2 porte `data-vb-loop`. C'est une section normale : le scroll la
traverse et continue vers la suite du site.

Les declencheurs portent `data-vb-usecase="v1"`, `data-vb-usecase="v2"`, etc. :
Ils peuvent etre n'importe quel element : `Button`, `Link block`, `Div block`.
Si ce n'est pas un vrai `<button>`, le script ajoute `role="button"` et
`tabindex="0"` pour que le clavier fonctionne.

L'etat selectionne est reflete de deux facons, au choix pour le styling :

- l'attribut `aria-pressed="true"` / `"false"`
- la classe `is-active`

En Webflow, le plus simple est de creer une combo class `is-active` sur le
premier bouton et d'y definir l'etat selectionne.

## 4. L'ecran de chargement (optionnel)

Un bloc portant `data-vb-loader` est masque automatiquement des que la premiere
video est prete. Le script pose sur la balise `<html>` un attribut
`data-vb-state` valant `loading`, `ready`, `error` ou `reduced`, utilisable pour
des styles conditionnels.

## 5. Le reste du site

Toutes les sections qui suivent doivent etre au-dessus du fond video. La
feuille de style s'en charge pour les deux sections concernees ; pour les
autres, leur donner un fond opaque suffit, sinon la video restera visible
derriere.

## 6. Le code personnalise

Coller [`webflow/head.html`](../webflow/head.html) dans **Page settings > Inside
`<head>` tag** et [`webflow/footer.html`](../webflow/footer.html) dans **Before
`</body>` tag**. Les deux fichiers sont deja renseignes.

Ils pointent sur deux origines distinctes : le bundle vient de GitHub via
jsDelivr, les videos de Bunny. A retenir pour la maintenance :

| Ce qui change | Ou le modifier | Effet de bord |
| --- | --- | --- |
| Le code | tag `@vX.Y.Z` dans head.html **et** footer.html | rebuild + commit de `dist/` + tag git |
| Le domaine Bunny | `base` dans [`src/config.js`](../src/config.js) | l URL est compilee dans le bundle : rebuild et nouveau tag obligatoires |

Le second cas est le piege : changer le CDN video impose de republier le code.

L'ordre du footer compte : `gsap`, puis `ScrollTrigger`, puis `scroll-video.js`.

## Verifier que tout est branche

Une fois publie, ouvrir la console :

- `window.scrollVideo.stage.mode` renvoie `scrub`, `loop` ou `idle`
- `window.scrollVideo.stage.activeId` renvoie `v1` ou `v2`
- `window.scrollVideo.stage.progress` suit la position dans la section 1

Si `window.scrollVideo` est indefini, l'un des trois elements racines manque :
le detail est logue au chargement.
