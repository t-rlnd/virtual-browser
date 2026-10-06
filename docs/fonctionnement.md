# Ce que fait le site

Le bundle porte deux animations indépendantes et un smooth scroll. Cette page
décrit ce que voit le visiteur ; [`architecture.md`](architecture.md) décrit
qui fait quoi dans le code.

## Le smooth scroll

Sur tout le site, la molette ne fait plus sauter la page : elle glisse
jusqu'à sa cible ([Lenis](https://lenis.darkroom.engineering)). Coupé si le
visiteur demande moins d'animations (`prefers-reduced-motion`). Le tactile
n'est pas lissé, iOS et Android ayant déjà leur inertie.

## Le Héros

En haut de page, une vidéo avance au rythme du scroll derrière un titre fixe.
Le texte change deux fois, à 1/3 et 2/3 de la vidéo, ligne par ligne. Il
garde son scrub sur tablette et mobile.

## Protocol

Le cœur du site, en trois temps :

| Temps | Ce qui se passe | Nom dans le code |
| --- | --- | --- |
| 1. On scrolle | La vidéo plein écran avance avec le scroll, le titre s'efface, la vidéo rétrécit pour se caler dans un cadre | `scrub` |
| 2. On arrive au bout | La vidéo joue seule en boucle dans son cadre : 4 tours, puis le use-case suivant. Des onglets permettent de changer de vidéo, un bouton de mettre en pause | `loop` |
| 3. On sort de la section | Tout se met en pause, rien ne tourne pour rien | `idle` |

Une fois la boucle atteinte, **remonter ne rembobine plus** : la vidéo reste
dans son cadre et la piste de scroll se replie à une hauteur d'écran.

**Sous 991 px** (tablette, mobile), Protocol n'a plus de scrub : les sections
s'empilent normalement et la vidéo boucle directement dans son cadre.

## L'idée clé, en une phrase

Le scroll ne produit **qu'un seul nombre**, une progression de 0 à 1. Tout le
reste en découle : la position dans la vidéo, la taille du cadre, l'apparition
des textes.

```
scroll ──► progression 0 → 1 ──┬──► la vidéo avance       (JS)
                               ├──► le cadre se resserre  (JS → variables CSS)
                               └──► titres et onglets     (CSS, via --vb-scrub)
```

Le JavaScript publie ce nombre dans une variable CSS, `--vb-scrub`. Les
apparitions et disparitions sont donc écrites **en CSS**, pas en JS.

## Comment ça s'assemble dans Webflow

Le script ne s'appuie **que sur des attributs `data-vb-*`**, jamais sur des
classes. On peut renommer et restyler librement dans le Designer, tant que les
attributs restent en place (Settings › Custom attributes).

Les éléments indispensables de Protocol :

| Attribut | Rôle |
| --- | --- |
| `data-vb-scrub` | La « piste » : un bloc haut (300vh) qui donne la longueur de scroll |
| `data-vb-scrub-inner` | Le conteneur collé (`sticky`) qui reste à l'écran pendant qu'on scrolle la piste |
| `data-vb-stage` | Le fond vidéo, qui contient une `<video data-vb-id="uc1">` par use-case |
| `data-vb-intro` / `data-vb-loop` | Les deux sections, **superposées** : l'intro s'efface, la boucle apparaît |
| `data-vb-switch="uc1"` | Un onglet de use-case |
| `data-vb-frame` | Le cadre où la vidéo vient se loger |

La structure complète, pas à pas : [`webflow-setup.md`](webflow-setup.md).

Le **découpage de chaque vidéo** (où finit le scrub, où finit la boucle) se
règle aussi par attribut, en numéros d'image :

```html
<video data-vb-id="uc1" data-vb-asset="video1" data-vb-loop-at="166" data-vb-loop-end="398"></video>
```

Ajouter un use-case ne demande donc **aucune modification du code** : une
`<video>`, un onglet et ses cards dans le Designer, les fichiers sur Bunny
([`videos.md`](videos.md)).

## Limites connues

- **iOS ne se teste que sur un vrai iPhone.** Les tests WebKit reproduisent le
  décodeur de Safari, pas ses règles d'autoplay ni d'économie d'énergie.
- **Tout bloc collé plein écran doit porter une couleur de fond** (Safari
  iOS 26 affiche une bande unie sous sa barre d'adresse), voir
  [`webflow-setup.md`](webflow-setup.md#la-couleur-de-fond-du-conteneur-colle-safari-ios).
- Si un jour le scrub vidéo ne tient pas sur un appareil, le code est prêt pour
  un rendu par séquence d'images : voir
  [`architecture.md`](architecture.md#pourquoi-une-classe-videolayer-abstraite).
