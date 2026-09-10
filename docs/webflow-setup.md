# Structure a construire dans le Designer Webflow

Le script ne cible que des attributs `data-vb-*`. Aucune classe Webflow n'est
referencee : le designer reste libre de renommer et restyler ce qu'il veut,
tant que les attributs restent en place.

Les attributs se posent dans le panneau **Settings (D) > Custom attributes**.

## Vue d'ensemble

Les deux sections ne se succedent pas : elles s'**empilent** dans un unique
conteneur colle, et ce sont leurs opacites qui font passer de l'une a l'autre.

```
body
├── div                       data-vb-loader          (optionnel)
├── div  "Protocol"           data-vb-scrub           la piste · height: 300vh
│   └── div                   data-vb-scrub-inner     sticky · top 0 · 100dvh · overflow hidden
│       ├── div               data-vb-stage           absolute · inset 0 · z-index 0
│       │   ├── video         data-vb-video="v1"
│       │   │                 data-vb-file="video1"
│       │   │                 data-vb-transition="166"
│       │   │                 data-vb-end="398"
│       │   └── video         data-vb-video="v2"
│       │                     data-vb-file="video2"
│       │                     data-vb-transition="116"
│       │                     data-vb-end="247"
│       │
│       ├── div  "Intro"                              absolute · inset 0 · z-index 1
│       │   └── (titre, texte...)                     opacite pilotee par --vb-scrub
│       │
│       └── div  "Use cases"  data-vb-loop            absolute · inset 0 · z-index 2
│           ├── div / button  data-vb-usecase="v1"     fond transparent
│           │   └── div       data-vb-progress         largeur 0 → 100 % sur les 2 tours
│           ├── div / button  data-vb-usecase="v2"
│           │   └── div       data-vb-progress
│           ├── div           data-vb-when="v1"        cards + legende use-case 1
│           ├── div           data-vb-when="v2"        cards + legende use-case 2
│           └── div           data-vb-frame            ou le fond vient se caler
└── (suite du site)
```

La hauteur de la piste est le seul reglage de rythme. Le conteneur colle
consommant la derniere hauteur d'ecran, la course d'epinglage vaut
`hauteur de piste - 100vh`, et `loopReserve` en reserve la fin a la boucle :

```
piste 300vh
└── course 200vh
    ├── scrub    100vh   le titre s'efface, la video va de 00:00 a 00:03
    └── reserve  100vh   la video boucle dans son cadre  (loopReserve: 1)
```

## 1. Le fond video

Un unique bloc `div` avec l'attribut `data-vb-stage`, laisse **sans valeur**.

### Le positionner : c'est au Designer de le faire

La feuille de style du script **ne positionne rien** : ni le stage, ni les
sections. Elle ne pose que ce qui tient au fonctionnement du fond video
(empilement interne des couches, recadrage, etats de chargement). Le Designer
garde donc la main sans avoir a lutter contre elle.

Deux mises en place courantes.

**Fond fixe, plein ecran** — il reste colle a l'ecran sur toute la page :

```
div  .video_background        position: fixed, inset 0
     data-vb-stage
└── HTML Embed                les balises <video>
```

**Fond sticky borne a un conteneur** — il s'arrete a la fin de celui-ci :

```
div  .protocol_background          position: absolute, derriere les sections
└── div  .protocol_videos-wrapper  position: sticky, 100vw x 100vh
         data-vb-stage
    └── HTML Embed                 les balises <video>
```

Deux obligations, dans les deux cas :

- le stage doit etre un **ancetre positionne** (`relative`, `absolute`,
  `fixed` ou `sticky`), les couches video etant en `position: absolute` a
  l'interieur. Reste-t-il `static`, le script le signale dans la console ;
- c'est a toi de poser le fond, aucune `background-color` n'etant appliquee.

Pour un fond noir qui s'efface quand la video vient se caler dans son cadre
(section 4), passer par un Embed plutot que par le Designer, `calc()` et les
variables CSS n'y etant pas saisissables :

```html
<style>
  .video_background { background-color: rgb(0 0 0 / calc(1 - var(--vb-dock))); }
</style>
```

L'ancienne valeur `data-vb-stage="custom"`, qui servait a desactiver un
positionnement impose par la feuille de style, n'a plus d'objet : elle est sans
effet, et peut etre retiree.

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
4. Dupliquer les piles `[data-vb-when]` (cards, legende) avec `data-vb-when="v3"`.
5. Encoder et televerser `video3-750.mp4`, `video3-1280.mp4`, `video3-1920.mp4`
   (voir `scripts/encode.sh`).

Le script decouvre les balises au chargement : la nouvelle video est scrubee
sur **sa** intro, boucle sur **son** segment, et reste sticky comme les autres.

## 2. La piste et le conteneur colle

La piste porte `data-vb-scrub` et une hauteur fixe — `300vh` pour le rythme
actuel. Son unique enfant porte `data-vb-scrub-inner` et se met en
`position: sticky; top: 0; height: 100dvh; overflow: hidden`. C'est lui qui
reste colle a l'ecran, et c'est dans lui que vivent les trois calques : le
fond, le titre, les use-cases.

La feuille de style du script n'impose ni hauteur ni positionnement au
chargement — c'est au Designer de les poser. Exception : une fois la boucle
atteinte, le script ramene la piste a `100dvh` (voir plus bas).

Le scrub commence quand le haut de la piste atteint le haut de l'ecran. Il ne
va pas jusqu'au bout de la course : `loopReserve` dans
[`src/config.js`](../src/config.js) en reserve la fin a la boucle, exprimee en
hauteurs d'ecran.

| `loopReserve` | Sur une piste de 300vh (course 200vh) |
| --- | --- |
| `1` | 100vh de scrub, puis 100vh de boucle — la valeur actuelle |
| `0.5` | 150vh de scrub, puis 50vh de boucle |
| `0` | 200vh de scrub, et la boucle n'est jamais vue |

Sans reserve, la boucle prendrait la main au moment ou le conteneur se decolle,
c'est-a-dire hors de vue. Pour allonger le scrub sans toucher a la boucle, il
suffit de monter la hauteur de la piste : la reserve etant comptee en hauteurs
d'ecran, tout le supplement va au scrub.

### Le passage en boucle est definitif

Remonter ne relance pas le scrub : la video reste a tourner dans son cadre, et
se met en pause quand la piste quitte l'ecran. C'est `latchLoop: true` dans
[`src/config.js`](../src/config.js).

Dans la foulee, la piste passe de 300vh a `100dvh` : le scrub deja consomme
(et la reserve) ne servent plus, et laisseraient un long scroll mort.
`data-vb-latched="true"` est pose sur `<html>` et y reste, y compris en
`idle`. Ne pas accrocher ce collapse a `data-vb-mode` — en sortant de la
section le mode reviendrait a `idle` et la piste reprendrait 300vh, ce qui
ferait sauter toute la page.

Cote Designer : **aucune** hauteur a changer. Garder 300vh sur Protocol ;
le script la passe a 100dvh tout seul. L'inner sticky doit rester en
`100dvh` (pas `100vh`) pour coller a la piste collapsee.

Masquer l'Intro une fois UseCase plein ecran est un choix de page, orthogonal :

```css
:root[data-vb-latched] .protocol_intro { display: none; }
```

Consequence a garder en tete cote maquette, et elle est plus large qu'avant :
le verrou fige aussi la progression, donc `--vb-scrub` avec elle. Remonter
n'y ramene pas le titre — la mise en scene reste ou elle en etait, section 2
affichee par-dessus une video calee dans son cadre. Un cran vers le haut
quitte la section (s'il y a du contenu au-dessus) ; un cran vers le bas
montre la suite du site.

`latchLoop: false` restaure l'aller-retour : remonter rembobine la video,
ramene le titre et rend le fond au plein ecran. La piste reste a 300vh. C'est
le comportement le plus proche d'une maquette entierement pilotee par le
scroll.

## 3. La section des use-cases

La section 2 porte `data-vb-loop`. Elle vit **dans** le conteneur colle, en
`position: absolute; inset: 0`, par-dessus le fond et le titre. Sa position ne
declenche donc plus rien : elle est a l'ecran du premier au dernier pixel de la
piste, et c'est son opacite qui la revele.

```css
[data-vb-loop] {
  position: absolute;
  inset: 0;
  z-index: 2;
  opacity: calc((var(--vb-scrub) - 0.3) / 0.3);
  pointer-events: none;
}

:root[data-vb-mode='loop'] [data-vb-loop] {
  pointer-events: auto;
}
```

Le `pointer-events` n'est pas un detail : une opacite s'interpole, lui non. A
opacite nulle les boutons resteraient cliquables, et un clic dans le vide
changerait la video de fond. L'attribut `data-vb-mode` pose sur `<html>` tranche
la question — voir la section 5.

Les declencheurs portent `data-vb-usecase="v1"`, `data-vb-usecase="v2"`, etc. :
Ils peuvent etre n'importe quel element : `Button`, `Link block`, `Div block`.
Si ce n'est pas un vrai `<button>`, le script ajoute `role="button"` et
`tabindex="0"` pour que le clavier fonctionne.

L'etat selectionne est reflete de trois facons, au choix pour le styling :

- l'attribut `data-vb-active="true"` / `"false"`
- l'attribut `aria-pressed="true"` / `"false"`
- la classe `is-active`

En Webflow, le plus simple est de styliser sur l'attribut, qui n'oblige a rien
cote classes :

```css
[data-vb-active="true"] .prot-demo_timeblock { background: #fff; }
```

### La barre d'avancee de la boucle

Un element portant `data-vb-progress` **a l'interieur** d'un bouton voit sa
largeur ecrite a chaque image, de `0%` au debut de la serie de tours a `100%`
a la fin du dernier (`loopRepeats`, 2 par defaut). Elle ne rembobine plus a
chaque passage : a mi-serie elle est a 50 %. C'est la position reelle de la
video, etagee par le Stage, qui est lue, pas un minuteur : la barre reste
juste meme si le decodage prend du retard.

```
div / button          data-vb-usecase="v1"
└── div  .prot-demo_timeblock-rail     le rail, largeur fixe, overflow: hidden
    └── div  .prot-demo_timeblock      data-vb-progress
```

L'attribut est laisse **sans valeur** : le use-case est deduit du bouton
parent. Une barre placee ailleurs dans la page doit nommer le sien :
`data-vb-progress="v1"`.

A poser en Webflow sur `.prot-demo_timeblock` : `width: 0%`, et une hauteur et
une couleur. Ne pas y mettre de `transition` sur `width` — le script ecrit la
valeur a chaque image, une transition la ferait trainer derriere la video. Le
parent tient le rail : largeur totale, `overflow: hidden`.

Seule la barre du use-case affiche avance ; les autres sont remises a zero, de
meme que toutes les barres des que la boucle s'arrete (retour en scrub ou
section sortie de l'ecran).

En plus de la largeur, la valeur brute est publiee en variable CSS
`--vb-progress` (0 a 1) sur le meme element, de quoi piloter autre chose sans
repasser par le JS.

### Cards, legendes, calques propres a un use-case

Tout element qui ne doit vivre que pour certains use-cases porte
`data-vb-when`. La valeur est le meme identifiant que `data-vb-video` /
`data-vb-usecase` :

- `data-vb-when="v1"` — visible seulement pour le use-case 1
- `data-vb-when="v2"` — visible seulement pour le use-case 2
- `data-vb-when="v1 v2"` — visible pour les deux (espaces ou virgules)

Sans l'attribut, l'element reste toujours affiche (boutons, cadre video, texte
commun).

Dans le Designer, dupliquer cards et legende, les laisser dans le meme parent,
et taguer chaque pile. Settings (D) > Custom attributes : Name `data-vb-when`,
Value `v1` ou `v2`.

```
div  data-vb-when="v1"
├── cards use-case 1
└── legende use-case 1

div  data-vb-when="v2"
├── cards use-case 2
└── legende use-case 2
```

Si cards et legende ne sont pas dans le meme wrapper, poser `data-vb-when` sur
chacun.

Le script ne decide pas du style. Il publie l'etat, la feuille masque :

- `data-vb-current="v1"` (ou `v2`) sur `<html>`
- `data-vb-shown="true"` / `"false"` sur chaque `[data-vb-when]`

Ne pas ecrire `data-vb-shown` a la main : le script le pose au chargement et a
chaque bascule.

La feuille du bundle masque les piles inactives pour qu'elles ne s'empilent
pas :

```css
[data-vb-when]:not([data-vb-shown='true']) { display: none; }
```

Un fondu se surcharge cote page (opacity, visibility) si besoin : retirer le
`display: none` dans un Embed, puis animer `[data-vb-shown]`.

## 4. Le cadre d'accueil de la video (optionnel)

Un element de la section 2 portant `data-vb-frame` devient la place du fond
video : la video quitte progressivement le plein ecran pour venir s'y caler,
puis suit ce cadre tant que la page defile.

Le mouvement est **pilote par le scroll**, pas par une duree : il est une
fonction de la progression, exactement comme le timecode de la video. A
mi-parcours il est a mi-chemin, et remonter le defait. La plage se regle par
`dockRange` dans [`src/config.js`](../src/config.js) :

```js
dockRange: { start: 0.05, end: 0.65 }
```

Soit : plein ecran jusqu'a 5 % de la course, entierement cale a 65 %, et le
mouvement etale entre les deux. Une plage vide (`start === end`) rend la
bascule seche au point donne.

Le cadre n'est qu'un **reperage de position** : donne-lui la taille et le
placement voulus, rien d'autre. Deux contraintes en decoulent.

1. **Le cadre doit etre transparent.** Le fond etant un calque separe qui passe
   *derriere* la section, un `background-color` sur le cadre masquerait la
   video au lieu de la reveler.
2. **La section 2 doit l'etre aussi**, pour la meme raison. Si elle a besoin
   d'une couleur, la porter sur le `body` ou sur ses enfants — jamais sur la
   section elle-meme.

L'aplat noir du stage s'efface au rythme du recadrage : une fois la video calee
dans son cadre, le reste de la page redevient visible.

Le JS publie la geometrie en variables CSS sur le stage, utilisables pour
accrocher d'autres styles a la transition :

| Variable | Valeur |
| --- | --- |
| `--vb-dock` | `0` en plein ecran, `1` une fois calee, les valeurs intermediaires pendant le mouvement |
| `--vb-frame-x` / `-y` | Position de la couche dans le stage, en pixels |
| `--vb-frame-w` / `-h` | Taille de la couche, en pixels |

Exemple : arrondir les angles de la video seulement une fois calee.

```css
[data-vb-stage] [data-vb-video] {
  border-radius: calc(var(--vb-dock) * 16px);
}
```

Sans `data-vb-frame` dans la page, le fond reste plein ecran d'un bout a
l'autre : l'attribut est le seul interrupteur.

## 5. Ce que le script publie pour la mise en scene

Toute l'apparition et la disparition des calques se pilote en CSS, depuis des
valeurs posees sur la balise `<html>` — et, pour les piles de use-case, sur
chaque `[data-vb-when]`.

| Nom | Valeur | Sert a |
| --- | --- | --- |
| `--vb-scrub` | Progression du scrub, de 0 a 1 | Tout ce qui s'interpole : opacites, deplacements, echelles |
| `data-vb-mode` | `scrub`, `loop` ou `idle` | Tout ce qui ne s'interpole pas : `pointer-events`, `visibility` |
| `data-vb-latched` | `true` une fois la boucle atteinte | Collapse de la piste a 100dvh ; masquer l'Intro. Reste pose en `idle` |
| `data-vb-current` | `v1`, `v2`, … | Quel use-case est affiche ; cible CSS `:root[data-vb-current='v1']` |
| `data-vb-shown` | `true` / `false` | Pose sur chaque `[data-vb-when]`, pas sur `<html>` |
| `data-vb-state` | `loading`, `ready`, `error`, `reduced` | Les styles de chargement |
| `data-vb-compact` | `true` sous 991 px, absent sinon | Accrocher le layout empile sans dupliquer le breakpoint |

Les seuils de la maquette actuelle, a poser dans un Embed puisque `calc()` n'est
pas saisissable dans le Designer :

```css
/* Le titre s'efface sur le premier cinquieme de la course. */
.protocol_intro { opacity: calc(1 - var(--vb-scrub) / 0.2); }

/* La section 2 se revele de 30 % a 60 %. */
[data-vb-loop] { opacity: calc((var(--vb-scrub) - 0.3) / 0.3); }

/* Les pastilles n'arrivent que sur les 20 derniers pourcents. */
.prot-demo_pin { opacity: calc((var(--vb-scrub) - 0.8) / 0.2); }
```

Les valeurs hors de 0–1 sont ramenees dans l'intervalle par le navigateur : une
formule qui passe en negatif avant son seuil n'a pas besoin d'etre bornee.

## 5 bis. L'ecran de chargement (optionnel)

Un bloc portant `data-vb-loader` est masque automatiquement des que la premiere
video est prete.

## 5 ter. Tablette et mobile (sous 991 px)

Le montage superpose ne s'applique plus. Dans le Designer, au breakpoint
**Tablet** (et en dessous) :

1. `prot intro` et `prot demo` passent en `position: relative` (plus
   d'`absolute` / `inset: 0`) : elles s'empilent, l'une sous l'autre.
2. La piste (`data-vb-scrub`) reprend une hauteur `auto` : plus de `300vh`,
   plus de conteneur `sticky` 100 vh.
3. Les opacites accrochees a `--vb-scrub` sont forcees a `1`. Le script
   fige la progression a 1 pour caler la video dans son cadre : sans cet
   override, le titre disparaitrait.

```css
@media (max-width: 991px) {
  .protocol_intro,
  [data-vb-loop] {
    position: relative;
    opacity: 1;
    pointer-events: auto;
  }
}
```

Le script publie `data-vb-compact="true"` sur `<html>` des que le viewport
passe sous 991 px. On peut s'en servir a la place du media query :

```css
:root[data-vb-compact] .protocol_intro { opacity: 1; }
```

Cote video, plus de scrub : lecture autonome du segment de boucle
(`data-vb-transition` → `data-vb-end`) dans `[data-vb-frame]`. Les
use-cases restent cliquables. Quand `prot demo` quitte l'ecran, la video
se met en pause.

Le breakpoint se regle par `compactMaxWidth` dans
[`src/config.js`](../src/config.js) (991 par defaut).

## 6. Le reste du site

Toutes les sections qui suivent doivent etre au-dessus du fond video. La
feuille de style s'en charge pour les deux sections concernees ; pour les
autres, leur donner un fond opaque suffit, sinon la video restera visible
derriere.

## 7. Le code personnalise

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

## 8. Developper contre le site, sans republier

Pendant la mise au point, remplacer les deux URL jsDelivr par celles du serveur
local (`pnpm dev` les affiche au demarrage) :

```html
<link href="http://localhost:3000/dev/scroll-video.css" rel="stylesheet" />
<script defer src="http://localhost:3000/dev/scroll-video.js"></script>
```

Publier sur le domaine de staging `*.webflow.io` : le site charge alors le code
de la machine, et chaque sauvegarde recharge la page. Ni commit, ni tag, ni
televersement dans la boucle.

Le code personnalise ne s'executant pas dans le preview du Designer, il faut
publier au moins une fois. `http://localhost` echappant au blocage du contenu
mixte, une page HTTPS a le droit de charger ces deux fichiers ; un tunnel n'est
necessaire que pour tester depuis un telephone.

Ne pas oublier de remettre les URL jsDelivr avant de publier en production :
sinon la page cherche un localhost que le visiteur n'a pas.

## Verifier que tout est branche

Une fois publie, ouvrir la console :

- `window.scrollVideo.stage.mode` renvoie `scrub`, `loop` ou `idle`
- `document.documentElement.getAttribute('data-vb-latched')` vaut `true`
  une fois la boucle atteinte (piste a 100dvh), absent avant et en compact
- `window.scrollVideo.stage.activeId` renvoie `v1` ou `v2`
- `document.documentElement.getAttribute('data-vb-current')` doit valoir la
  meme chose que `activeId`
- `window.scrollVideo.stage.progress` suit la position dans la course de scrub
- `document.documentElement.style.getPropertyValue('--vb-scrub')` doit suivre
  la meme valeur : c'est elle qui pilote la mise en scene
- `[...document.querySelectorAll('[data-vb-video]')].map((e) => e.tagName)` doit
  renvoyer `['VIDEO', 'VIDEO']`. Un `DIV` signale que l'element Video du
  Designer a ete utilise a la place d'un HTML Embed, et le scrub ne peut pas
  fonctionner
- un `[data-vb-when="v1"]` doit porter `data-vb-shown="true"` quand v1 est
  actif, `"false"` sinon (et l'inverse pour v2)

Si `window.scrollVideo` est indefini, `[data-vb-stage]` ou `[data-vb-scrub]`
manque : ce sont les deux seuls elements dont le script a besoin pour demarrer,
et le detail est logue au chargement.

`data-vb-loop` n'en fait pas partie : c'est un repere pour la feuille de style,
pas pour le script. L'oublier n'empeche rien de tourner — la section 2 ne se
revelera simplement jamais, faute de regle CSS accrochee a `--vb-scrub`.

`data-vb-when`, lui, est lu par le script : sans lui, cards et legendes des
deux use-cases restent toutes visibles en meme temps.
