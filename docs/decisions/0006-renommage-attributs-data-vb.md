# Renommage des attributs `data-vb-*`

- Date : 2026-09-22
- Statut : Adopté

## Contexte

Le markup Webflow a été aligné sur des noms d'attributs plus lisibles
(`data-vb-id`, `data-vb-switch`, `data-vb-visible-on`, …) et des
identifiants `uc1` / `uc2`. Le bundle JS lisait encore l'ancienne
nomenclature (`data-vb-video`, `data-vb-usecase`, `v1` / `v2`) : plus
aucune couche n'était découverte, la vidéo restait cassée.

Les ADR précédents citent les anciens noms ; celui-ci est la source de
vérité pour le contrat actuel. Les chemins CDN (`video1` / `video2`,
prefixe `scroll-video/v1/`) ne changent pas.

## Décision

Le script, la feuille du bundle, la démo locale, les tests et la
documentation vivante lisent et publient exclusivement les attributs
suivants.

Structure :

| Ancien | Nouveau |
| --- | --- |
| `data-vb-when` | `data-vb-visible-on` |
| `data-vb-usecase` | `data-vb-switch` |
| ids `v1` / `v2` | `uc1` / `uc2` |

Config `<video>` :

| Ancien | Nouveau |
| --- | --- |
| `data-vb-video` | `data-vb-id` |
| `data-vb-file` | `data-vb-asset` |
| `data-vb-transition` | `data-vb-loop-at` |
| `data-vb-end` | `data-vb-loop-end` |

Runtime (JS → DOM) :

| Ancien | Nouveau |
| --- | --- |
| `data-vb-current` | `data-vb-active-id` |
| `data-vb-shown` | `data-vb-visible` |
| `data-vb-active` | `data-vb-selected` |
| `data-vb-latched` | `data-vb-locked` |

Inchangés : `data-vb-fps`, `data-vb-state`, `data-vb-mode`,
`data-vb-compact`, `data-vb-scrub`, `data-vb-scrub-inner`,
`data-vb-stage`, `data-vb-loop`, `data-vb-frame`, `data-vb-loader`,
`data-vb-progress`, `data-vb-fade`.

## Conséquences

- Recoller le site Webflow sur `pnpm dev` (`localhost:3000/dev/`)
  relit le markup actuel sans republier les MP4.
- Les extraits d'encodage (`encode.sh`, `export.sh`, `check-video.sh`)
  posent `data-vb-id="ucN"` quand le fichier s'appelle `videoN`.
- Les ADR 0003, 0004 et 0005 gardent les anciens noms : c'est
  l'historique de la décision, pas le contrat à copier.
