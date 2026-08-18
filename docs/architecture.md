# Comment le code est organise

Une page a lire avant de toucher a `src/`. Le README explique *ce que fait*
l'animation ; celle-ci explique *qui fait quoi* dans le code.

## L'idee en une phrase

Le scroll ecrit **un seul nombre** — une progression de 0 a 1 — et tout le
reste en decoule : le timecode de la video, la position du fond, l'apparition
des calques de la page.

## Le chemin d'une information

```
scroll de la page
      │
      ▼
scroll.js          traduit le scroll en progression (0 → 1) et en mode
      │            via GSAP ScrollTrigger
      ▼
Stage.js           machine a etats : { activeId, mode, progress }
      │            n'ecrit jamais dans le DOM, ne parle qu'aux couches
      │
      ├──────────────► layers/Mp4VideoLayer.js   seek / play / fondu sur la <video>
      ├──────────────► frame.js                  --vb-frame-* : le fond se cale dans son cadre
      ├──────────────► progress.js               --vb-scrub + data-vb-mode : la page anime ses calques
      └──────────────► usecases.js               boutons actifs + barres d'avancee
```

Le sens des fleches ne s'inverse jamais. `usecases.js` peut demander une
bascule (`stage.setActive('v2')`), mais il n'affiche rien de lui-meme : il
attend que le Stage lui renvoie l'evenement `activechange`. C'est pour ca que
l'affichage reste toujours d'accord avec ce qui est reellement joue, meme quand
une bascule est annulee en vol.

## Les trois etats du Stage

Tout le comportement tient dans ces trois variables :

| Variable | Ce qu'elle dit | Qui la change |
| --- | --- | --- |
| `progress` | ou en est le scroll dans la piste, de 0 a 1 | `scroll.js` |
| `mode` | `scrub`, `loop` ou `idle` | `scroll.js` |
| `activeId` | quelle video est affichee | `usecases.js` (au clic) |

Elles sont **independantes**. Changer `activeId` ne touche ni au mode ni a la
progression : c'est ce qui rend la bascule de use-case gratuite a implementer,
et retroactive quand `latchLoop` est a `false`.

| Mode | La couche active |
| --- | --- |
| `scrub` | en pause, son `currentTime` est ecrit par la progression |
| `loop` | lecture autonome en boucle sur son dernier segment |
| `idle` | en pause, rien ne se decode |

## Le role de chaque fichier

| Fichier | Responsabilite | A ouvrir quand |
| --- | --- | --- |
| `src/config.js` | reglages globaux + lecture des attributs `data-vb-*` d'une balise | on ajoute une video, on change un fondu |
| `src/Stage.js` | machine a etats, transitions et fondus croises | le comportement d'ensemble est faux |
| `src/scroll.js` | GSAP ScrollTrigger : course de scrub, verrou de boucle | le declenchement se fait au mauvais moment |
| `src/frame.js` | le fond quitte le plein ecran pour `[data-vb-frame]` | le recadrage est mal place |
| `src/progress.js` | publie `--vb-scrub` et `data-vb-mode` sur `<html>` | les calques de la page ne s'animent pas |
| `src/usecases.js` | boutons de use-case et barres d'avancee | un clic ne fait rien |
| `src/main.js` | assemblage, garde-fous, prechargement, deblocage iOS | rien ne demarre |
| `src/env.js` | reduced-motion, save-data, largeur a telecharger | la mauvaise definition est servie |
| `src/utils.js` | `clamp`, `wait`, et un emetteur d'evenements minimal | jamais, ou presque |
| `src/layers/VideoLayer.js` | le **contrat** d'une couche d'image | on veut un autre moteur de rendu |
| `src/layers/Mp4VideoLayer.js` | l'implementation `<video>` + MP4 | le scrub saccade, un seek ne rend rien |

## Pourquoi une classe `VideoLayer` abstraite

Le Stage ne sait pas ce qu'il pilote : il appelle `seek`, `playLoop`, `show`,
`hide` sur un objet qui respecte le contrat de `VideoLayer`. Passer un jour a
un rendu `<canvas>` alimente par une sequence d'images ne demanderait donc
qu'une seconde implementation de ce contrat, sans toucher ni a la machine a
etats ni au scroll.

Ce n'est pas theorique : [`demo/DebugLayer.js`](../demo/DebugLayer.js) en est
deja une, qui dessine un compteur dans un `<canvas>`. C'est elle qui fait
tourner la page de demonstration sans aucun fichier video.

## Ce qui est dans le DOM, et pas dans le code

Le decoupage de chaque video vit **sur la balise**, pas dans `config.js` :

```html
<video data-vb-video="v1" data-vb-file="video1" data-vb-transition="166" data-vb-end="398"></video>
```

Une seule source de verite. Ajouter un troisieme use-case, c'est ajouter une
`<video>` et un bouton dans le Designer Webflow — aucun rebuild, aucun tag.

## Les points d'attention

Trois endroits ou le code fait quelque chose de non evident, chacun commente
sur place :

- **`Mp4VideoLayer._drainSeek`** — un seul seek en vol a la fois. Sans cette
  serialisation, un scroll rapide empile les demandes et Safari finit par ne
  plus rien rendre.
- **`Mp4VideoLayer.unlock` + `Stage.refresh`** — sur iOS le decodeur reste
  inerte tant qu'aucune lecture n'a ete autorisee. Le premier geste lance donc
  brievement toutes les couches, puis `refresh()` les remet dans l'etat decrit
  par la machine. Le deblocage ne restaure rien lui-meme : il entrerait en
  concurrence avec une bascule declenchee par le meme clic.
- **`scroll.js`, le drapeau `reached`** — la section 2 etant superposee, elle
  est visible des le premier pixel. Sans ce garde-fou, le declencheur de
  visibilite lancerait la boucle avant meme que le scrub ait commence.
