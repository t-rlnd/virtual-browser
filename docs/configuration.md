# Réglages

Les réglages globaux vivent dans [`src/config.js`](../src/config.js), chacun
commenté. Les plus utiles :

| Réglage | Défaut | Effet |
| --- | --- | --- |
| `loopRepeats` | `4` | Tours de boucle avant de passer au use-case suivant (`Infinity` = boucle sans fin) |
| `fadeMs` | `250` | Durée du fondu entre deux use-cases (ms) |
| `dockRange` | `0.05 → 0.65` | Plage de la progression pendant laquelle la vidéo se cale dans son cadre |
| `loopReserve` | `1` | Hauteurs d'écran réservées à la boucle en fin de piste |
| `scrubSmoothing` | `0.1` | Inertie du scrub (0 = collé au scroll) ; faible car Lenis lisse déjà |
| `smooth` | `true` | Smooth scroll Lenis sur tout le site (coupé en reduced-motion) |
| `lenis` | `{ lerp: 0.1 }` | Options Lenis : `lerp` plus petit = plus glissé |
| `compactMaxWidth` | `991` | Largeur sous laquelle Protocol passe en mode compact |
| `widths` | `[750, 1280, 1920]` | Largeurs encodées : ne pas changer sans ré-exporter les vidéos |
| `base` | `https://virtual-browser.b-cdn.net/home/v1` | Racine CDN des MP4 |
| `hero.steps` | `3` | Nombre de textes du Héros |
| `defaultActive` | `uc1` | Use-case affiché au chargement |

## Surcharger sans rebuild

Depuis Webflow, avant le script :

```html
<script>
  window.SCROLL_VIDEO_CONFIG = { loopRepeats: 2, fadeMs: 180 };
</script>
```

Pratique pour tester une valeur sur le site publié. Changer une valeur **par
défaut** (y compris `base` et `widths`) se fait dans `config.js` : elle est
alors compilée dans le bundle, donc rebuild et push
([`hosting.md`](hosting.md)).

## Ce qui ne se règle pas ici

- **Le rythme du scroll** : la hauteur de la piste dans le Designer (300vh
  pour Protocol, 400vh pour le Héros). Plus haut = plus lent.
- **Le découpage de chaque vidéo** : sur la balise `<video>`, par attributs
  (`data-vb-loop-at`, `data-vb-loop-end`, `data-vb-hero-end`), voir
  [`videos.md`](videos.md#3-servir-dans-webflow).
- **Les seuils d'apparition des calques** (titre, section démo, onglets) :
  dans `src/styles/scene.css`, à partir de `--vb-scrub`.
