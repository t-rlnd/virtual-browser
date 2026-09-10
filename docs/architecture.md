# Comment le code est organise

Une page a lire avant de toucher a `src/`. Le README explique *ce que fait*
l'animation ; celle-ci explique *qui fait quoi* dans le code.

## L'idee en une phrase

Le scroll ecrit **un seul nombre** — une progression de 0 a 1 — et tout le
reste en decoule : le timecode de la video, la position du fond, l'apparition
des calques de la page.

## Stack

- JS vanilla (ES modules), pas de framework.
- GSAP 3 + ScrollTrigger charges depuis jsDelivr, lus sur `window` — jamais
  bundle (voir `bin/build.js` et `webflow/footer.html`).
- esbuild : bundle `dist/scroll-video.js` + `.css` ; serveur local avec
  requetes Range (`bin/serve-media.js`).
- Playwright pour les parcours e2e (Chromium / WebKit / Firefox).
- ffmpeg via `scripts/` pour l'encodage all-intra.

## Points d'entrée

| Surface | Fichier |
| --- | --- |
| Runtime Webflow | `src/main.js` → `init()`, colle via `webflow/head.html` + `webflow/footer.html` |
| Demo locale | `index.html` + `demo/demo.js` (`DebugLayer`) ; `?real` charge les MP4 |
| Build / serveur | `bin/build.js` (`pnpm dev` / `pnpm build`) |
| Tests unitaires | `test/*.test.mjs` (`pnpm test`) — attributs, Stage, mode compact |
| Parcours e2e | `test/e2e.mjs` (`pnpm test:e2e`, `test:bundle`) |

## Le chemin d'une information

```
scroll de la page
      │
      ▼
playback.js        compact (< 991 px) ou scrub (desktop)
      │
      ├──────────────► compact.js   visibilite de [data-vb-loop] → loop / idle
      └──────────────► scroll.js    GSAP ScrollTrigger → progress + mode
                                    (+ collapse piste / data-vb-latched)
      │
      ▼
Stage.js           machine a etats : { activeId, mode, progress }
      │            n'ecrit jamais dans le DOM, ne parle qu'aux couches
      │
      ├──────────────► layers/Mp4VideoLayer.js   seek / play / fondu sur la <video>
      ├──────────────► frame.js                  --vb-frame-* : le fond se cale dans son cadre
      ├──────────────► progress.js               --vb-scrub, data-vb-mode, data-vb-current / [data-vb-when]
      └──────────────► usecases.js               boutons actifs + barres d'avancee
```

Le sens des fleches ne s'inverse jamais. `usecases.js` peut demander une
bascule (`stage.setActive('v2')`), mais il n'affiche rien de lui-meme : il
attend que le Stage lui renvoie l'evenement `activechange`. Le Stage peut
aussi basculer tout seul, au bout de `loopRepeats` tours de boucle. Dans
les deux cas l'affichage suit `activechange`, y compris si une bascule est
annulee en vol.

## Les trois etats du Stage

Tout le comportement tient dans ces trois variables :

| Variable | Ce qu'elle dit | Qui la change |
| --- | --- | --- |
| `progress` | ou en est le scroll dans la piste, de 0 a 1 | `scroll.js` |
| `mode` | `scrub`, `loop` ou `idle` | `scroll.js` |
| `activeId` | quelle video est affichee | `usecases.js` (au clic) ; `Stage` (fin de boucle) |

Elles sont **independantes**. Changer `activeId` ne touche ni au mode ni a la
progression : c'est ce qui rend la bascule de use-case gratuite a implementer,
et retroactive quand `latchLoop` est a `false`.

| Mode | La couche active |
| --- | --- |
| `scrub` | en pause, son `currentTime` est ecrit par la progression |
| `loop` | lecture autonome, `loopRepeats` tours (defaut 2) puis le use-case suivant |
| `idle` | en pause, rien ne se decode |

Sous 991 px (`compactMaxWidth`), `scroll.js` n'est jamais branche : la
progression est figee a 1, le mode ne fait que `loop` / `idle` selon la
visibilite de `[data-vb-loop]`, et l'intro scrubee n'est pas lue. Voir
[`decisions/0002-mode-compact-sous-991.md`](decisions/0002-mode-compact-sous-991.md).

## Le role de chaque fichier

| Fichier | Responsabilite | A ouvrir quand |
| --- | --- | --- |
| `src/config.js` | reglages globaux + lecture des attributs `data-vb-*` d'une balise | on ajoute une video, on change un fondu |
| `src/Stage.js` | machine a etats, transitions, fondus, auto-avance apres `loopRepeats` tours | le comportement d'ensemble est faux |
| `src/playback.js` | choix compact vs scrub, attribut `data-vb-compact` | le mauvais cablage se declenche sous 991 px |
| `src/scroll.js` | GSAP ScrollTrigger : course de scrub, verrou de boucle, collapse de la piste a 100dvh | le declenchement se fait au mauvais moment, ou remonter traverse du scroll mort |
| `src/compact.js` | visibilite de la section demo → boucle ou pause | la video tourne hors ecran, ou pas du tout |
| `src/frame.js` | le fond quitte le plein ecran pour `[data-vb-frame]` | le recadrage est mal place |
| `src/progress.js` | publie `--vb-scrub`, `data-vb-mode`, `data-vb-current` sur `<html>`, et `data-vb-shown` sur chaque `[data-vb-when]` | les calques ne s'animent pas, ou les piles restent toutes visibles |
| `src/usecases.js` | boutons de use-case et barres d'avancee (`loopProgress`) | un clic ne fait rien, ou la barre rembobine |
| `src/main.js` | assemblage, garde-fous, prechargement, deblocage iOS | rien ne demarre |
| `src/env.js` | reduced-motion, save-data, largeur a telecharger, breakpoint compact | la mauvaise definition est servie |
| `src/utils.js` | `clamp`, `wait`, et un emetteur d'evenements minimal | jamais, ou presque |
| `src/layers/VideoLayer.js` | le **contrat** d'une couche d'image | on veut un autre moteur de rendu |
| `src/layers/Mp4VideoLayer.js` | l'implementation `<video>` + MP4 | le scrub saccade, un seek ne rend rien |
| `src/styles/scroll-video.css` | styles structurels, cibles par `data-vb-*` ; ne positionne pas le stage (sauf collapse latched) | un style du fond ou d'une couche est faux |

## Pourquoi une classe `VideoLayer` abstraite

Le Stage ne sait pas ce qu'il pilote : il appelle `seek`, `playLoop`, `show`,
`hide` sur un objet qui respecte le contrat de `VideoLayer`. `playLoop` recoit
un callback `onCycle` : la couche notifie chaque fin de tour, le Stage compte
et decide s'il faut reboucler ou enchainer le use-case suivant. Passer un
jour a un rendu `<canvas>` alimente par une sequence d'images ne demanderait
donc qu'une seconde implementation de ce contrat, sans toucher ni a la
machine a etats ni au scroll.

Ce n'est pas theorique : [`demo/DebugLayer.js`](../demo/DebugLayer.js) en est
deja une, qui dessine un compteur dans un `<canvas>`. C'est elle qui fait
tourner la page de demonstration sans aucun fichier video.

## Ce qui est dans le DOM, et pas dans le code

Le decoupage de chaque video vit **sur la balise**, pas dans `config.js` :

```html
<video data-vb-video="v1" data-vb-file="video1" data-vb-transition="166" data-vb-end="398"></video>
```

Une seule source de verite. Ajouter un troisieme use-case, c'est ajouter une
`<video>`, un bouton et les piles `[data-vb-when]` dans le Designer Webflow —
aucun rebuild, aucun tag. Voir
[`decisions/0003-decoupage-sur-la-balise.md`](decisions/0003-decoupage-sur-la-balise.md).

Les cards et legendes propres a un use-case vivent de la meme facon **sur la
page**, pas dans le JS : `data-vb-when="v1"` (ou `v2`). `progress.js` pose
`data-vb-current` sur `<html>` et `data-vb-shown` sur chaque pile ; la feuille
masque le reste.

## Les points d'attention

Quatre endroits ou le code fait quelque chose de non evident, chacun commente
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
  visibilite lancerait la boucle avant meme que le scrub ait commence. En
  compact ce probleme n'existe pas : il n'y a plus de superpositions, et
  c'est `[data-vb-loop]` qui est observee, pas la piste.
- **`scroll.js`, le collapse a `100dvh`** — une fois le verrou arme, la piste
  de 300vh ne sert plus. La ramener a une hauteur d'ecran sans recaler
  `scrollY` decroche le sticky (on a deja parcouru plus d'un ecran). Le
  signal est `data-vb-latched`, pas `data-vb-mode` : en idle, retendre la
  piste ferait sauter la page. Voir
  [`decisions/0005-collapse-piste-apres-latch.md`](decisions/0005-collapse-piste-apres-latch.md).
