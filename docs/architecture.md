# Comment le code est organise

Une page a lire avant de toucher a `src/`. Le README explique *ce que fait*
l'animation ; celle-ci explique *qui fait quoi* dans le code.

## L'idee en une phrase

Le scroll ecrit **un seul nombre** — une progression de 0 a 1 — et tout le
reste en decoule : le timecode de la video, la position du fond, l'apparition
des calques de la page.

## Si tu découvres le code

Une image pour se repérer : le projet fonctionne comme un **plateau de
tournage**.

- `scroll.js` est l'**assistant** qui regarde le scroll et annonce « on en est
  à 40 % », « on passe en boucle ».
- `Stage.js` est le **réalisateur** : il tient le script (l'état courant) et
  donne les ordres. Il ne touche jamais lui-même au décor (le DOM).
- Les **couches** (`Mp4VideoLayer`) sont les caméras : elles exécutent
  (« va à 2,4 s », « joue en boucle »).
- `progress.js`, `usecases.js`, `pause.js`, `frame.js` sont les
  **accessoiristes** : ils écoutent les annonces du réalisateur et mettent à
  jour la page (attributs, variables CSS, boutons).

Ordre de lecture conseillé :

1. [`src/config.js`](../src/config.js) — les réglages, tous commentés.
2. [`src/Stage.js`](../src/Stage.js) — le cœur : quatre variables et leurs
   transitions.
3. [`src/scroll.js`](../src/scroll.js) — comment le scroll devient une
   progression.
4. [`src/main.js`](../src/main.js) — comment tout est branché au démarrage.
5. Le reste à la demande, via le tableau
   [Le rôle de chaque fichier](#le-role-de-chaque-fichier).

Le vocabulaire (scrub, seek, all-intra…) est dans le
[glossaire](glossaire.md).

La section Héros (`hero.js`) est **à part** : elle ne passe pas par le Stage
(pas de boucle, pas de use-case) et se lit seule. Voir
[`decisions/0007-section-heros.md`](decisions/0007-section-heros.md).

## Stack

- JS vanilla (ES modules), pas de framework.
- GSAP 3 + ScrollTrigger (+ SplitText pour le Heros) charges depuis jsDelivr, lus sur `window` — jamais
  bundle (voir `bin/build.js` et `webflow/footer.html`).
- esbuild : bundle `dist/scroll-video.js` + `.css` ; serveur local avec
  requetes Range (`bin/serve-media.js`).
- Playwright pour les parcours e2e (Chromium / WebKit / Firefox).
- ffmpeg via `scripts/` pour l'encodage all-intra.

## Points d'entrée

| Surface | Fichier |
| --- | --- |
| Runtime Webflow | `src/main.js` → `boot()` : `startHero()` + `init()`, colle via `webflow/head.html` + `webflow/footer.html` |
| Tests e2e | `test/e2e.mjs` sur le site Webflow publie, bundle local injecte |
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
                                    (+ collapse piste / data-vb-locked)
      │
      ▼
Stage.js           machine a etats : { activeId, mode, progress, paused }
      │            n'ecrit jamais dans le DOM, ne parle qu'aux couches
      │
      ├──────────────► layers/Mp4VideoLayer.js   seek / play / fondu sur la <video>
      ├──────────────► frame.js                  --vb-frame-* : le fond se cale dans son cadre
      ├──────────────► progress.js               --vb-scrub, data-vb-mode, data-vb-active-id, data-vb-paused / [data-vb-visible-on]
      ├──────────────► usecases.js               boutons actifs + barres d'avancee
      └──────────────► pause.js                  bouton Pause/Play (aria-pressed)
```

Le sens des fleches ne s'inverse jamais. `usecases.js` peut demander une
bascule (`stage.setActive('uc2')`), mais il n'affiche rien de lui-meme : il
attend que le Stage lui renvoie l'evenement `activechange`. Le Stage peut
aussi basculer tout seul, au bout de `loopRepeats` tours de boucle. Dans
les deux cas l'affichage suit `activechange`, y compris si une bascule est
annulee en vol.

## Les quatre etats du Stage

Tout le comportement tient dans ces quatre variables :

| Variable | Ce qu'elle dit | Qui la change |
| --- | --- | --- |
| `progress` | ou en est le scroll dans la piste, de 0 a 1 | `scroll.js` |
| `mode` | `scrub`, `loop` ou `idle` | `scroll.js` |
| `activeId` | quelle video est affichee | `usecases.js` (au clic) ; `Stage` (fin de boucle) |
| `paused` | la boucle est figee par le visiteur | `pause.js` (bouton) ; `usecases.js` (un clic de use-case la leve) |

Elles sont **independantes**. Changer `activeId` ne touche ni au mode ni a la
progression : c'est ce qui rend la bascule de use-case gratuite a implementer,
et retroactive quand `latchLoop` est a `false`.

`paused` ne vaut qu'en `loop` (le scrub reste pilote par le scroll) mais
survit aux changements de mode : sortir de la section puis revenir laisse la
boucle figee. Le compteur de tours n'est pas touche — figee, la couche
n'acheve aucun tour, donc l'auto-avance attend d'elle-meme.

| Mode | La couche active |
| --- | --- |
| `scrub` | en pause, son `currentTime` est ecrit par la progression |
| `loop` | lecture autonome, `loopRepeats` tours (defaut 4) puis le use-case suivant ; figee si `paused` |
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
| `src/progress.js` | publie `--vb-scrub`, `data-vb-mode`, `data-vb-active-id`, `data-vb-paused` sur `<html>`, et `data-vb-visible` sur chaque `[data-vb-visible-on]` | les calques ne s'animent pas, ou les piles restent toutes visibles |
| `src/usecases.js` | boutons de use-case et barres d'avancee (`loopProgress`) | un clic ne fait rien, ou la barre rembobine |
| `src/pause.js` | bouton `[data-vb-pause]` : bascule `stage.paused`, reflete `aria-pressed` | la pause ne repond pas |
| `src/main.js` | assemblage, garde-fous, prechargement ; demarre Heros et Protocol independamment | rien ne demarre |
| `src/hero.js` | section Heros : ScrollTrigger sur `[data-vb-hero]` → seek de la video + etape de texte (1/3, 2/3), bascule ligne par ligne via SplitText | un texte du Heros change au mauvais moment, ou le titre saute |
| `src/unlock.js` | deblocage iOS au premier geste, partage par Protocol et le Heros | la video reste figee sur iPhone |
| `src/env.js` | reduced-motion, save-data, largeur a telecharger, breakpoint compact | la mauvaise definition est servie |
| `src/utils.js` | `clamp`, `wait`, `bindPress` (clic + clavier) et un emetteur d'evenements minimal | jamais, ou presque |
| `src/layers/VideoLayer.js` | le **contrat** d'une couche d'image | on veut un autre moteur de rendu |
| `src/layers/Mp4VideoLayer.js` | l'implementation `<video>` + MP4 | le scrub saccade, un seek ne rend rien |
| `src/styles/entry.css` | assemble `scroll-video.css` + `scene.css` + `hero.css` pour le bundle | le CSS de prod / dev ne sort pas |
| `src/styles/hero.css` | etat des textes du Heros avant script (l'empilement est dans le Designer) | deux textes du Heros apparaissent ensemble au chargement |
| `src/styles/scroll-video.css` | styles structurels, cibles par `data-vb-*` ; ne positionne pas le stage (sauf collapse latched) | un style du fond ou d'une couche est faux |
| `src/styles/scene.css` | mise en scene : opacites intro / demo / tabs, glissement des cards | un calque apparait au mauvais moment du scrub |

## Pourquoi une classe `VideoLayer` abstraite

Le Stage ne sait pas ce qu'il pilote : il appelle `seek`, `playLoop`, `show`,
`hide` sur un objet qui respecte le contrat de `VideoLayer`. `playLoop` recoit
un callback `onCycle` : la couche notifie chaque fin de tour, le Stage compte
et decide s'il faut reboucler ou enchainer le use-case suivant. Passer un
jour a un rendu `<canvas>` alimente par une sequence d'images ne demanderait
donc qu'une seconde implementation de ce contrat, sans toucher ni a la
machine a etats ni au scroll.

Une telle implementation (`DebugLayer`, compteur dessine dans un `<canvas>`)
a existe pour la page de demo locale, retiree depuis : le HTML vit dans
Webflow.

Les mesures actuelles (seek median de 2 a 5 ms, voir [`tests.md`](tests.md))
rendent cette migration improbable ; elle reste ouverte si iOS se comporte
autrement. C'est aussi pour elle que les `<video>` portent `crossOrigin` :
sans lui, un canvas lisant des pixels venus du CDN serait illisible.

## Ce qui est dans le DOM, et pas dans le code

Le decoupage de chaque video vit **sur la balise**, pas dans `config.js` :

```html
<video data-vb-id="uc1" data-vb-asset="video1" data-vb-loop-at="166" data-vb-loop-end="398"></video>
```

Une seule source de verite. Ajouter un troisieme use-case, c'est ajouter une
`<video>`, un bouton et les piles `[data-vb-visible-on]` dans le Designer Webflow —
aucun rebuild, aucun tag. Voir
[`decisions/0003-decoupage-sur-la-balise.md`](decisions/0003-decoupage-sur-la-balise.md).

Les cards et legendes propres a un use-case vivent de la meme facon **sur la
page**, pas dans le JS : `data-vb-visible-on="uc1"` (ou `uc2`). `progress.js` pose
`data-vb-active-id` sur `<html>` et `data-vb-visible` sur chaque pile ; la feuille
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
  signal est `data-vb-locked`, pas `data-vb-mode` : en idle, retendre la
  piste ferait sauter la page. Voir
  [`decisions/0005-collapse-piste-apres-latch.md`](decisions/0005-collapse-piste-apres-latch.md).
