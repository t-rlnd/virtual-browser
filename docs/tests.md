# Tests

Deux familles de tests, qui ne vérifient pas la même chose.

## 1. Tests unitaires — rapides, sans navigateur

```bash
pnpm test
```

Ils vérifient la logique pure : lecture des attributs `data-vb-*`, machine à
états du Stage, mode compact, Héros, publication des attributs. Quelques
secondes, **rien à lancer à côté**.

Un seul fichier : `node --test test/stage.test.mjs`.

| Fichier | Vérifie |
| --- | --- |
| `test/config.test.mjs` | lecture des attributs `data-vb-*` d'une balise |
| `test/stage.test.mjs` | transitions du Stage, tours de boucle, pause |
| `test/compact.test.mjs` | comportement sous 991 px |
| `test/progress.test.mjs` | ce qui est publié sur `<html>` |
| `test/hero.test.mjs` | étapes de texte du Héros |

## 2. Parcours e2e — un vrai navigateur

Playwright ouvre la page de démo, scrolle, clique et vérifie chaque étape
(une trentaine), avec des captures dans `.artifacts/`.

Ils ont besoin du serveur local : **lancer `pnpm dev` dans un autre
terminal** d'abord.

```bash
pnpm test:e2e                  # sur la démo canvas (sans vidéo)
REAL=1 pnpm test:e2e           # sur les vrais MP4
BROWSER=webkit pnpm test:e2e   # moteur de Safari (aussi : firefox)
```

`BROWSER=webkit` est le plus important : le scrub dépend du décodeur vidéo, et
Safari peut se figer sur des seeks rapides là où Chrome ne bronche pas.

En `REAL=1`, une étape de plus mesure le temps d'un seek : au-delà de 33 ms
(médiane), le scrub ne tient pas 30 images/seconde. Relevé actuel :

| Moteur | Seek médian | Pire cas |
| --- | --- | --- |
| WebKit | 2 ms | 5 ms |
| Chromium | 5 ms | 9 ms |

## 3. Avant de pousser un nouveau dist/

Rejouer le parcours sur le **bundle construit** (`dist/`), c'est-à-dire ce qui
sera réellement en ligne :

```bash
pnpm build
pnpm test:bundle
```

(toujours avec `pnpm dev` lancé à côté). La seule différence restante avec
Webflow est l'URL du bundle.

## Ce qui n'est pas testable ici

**iOS.** WebKit de bureau partage le décodeur de Safari, pas ses règles
d'autoplay ni d'économie d'énergie. Le déblocage de la vidéo au premier geste
ne se vérifie que sur un vrai iPhone.

Pour vérifier le site Webflow publié à la main, voir la checklist console en
fin de [`webflow-setup.md`](webflow-setup.md#verifier-que-tout-est-branche).
