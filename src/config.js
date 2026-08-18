/**
 * Reglages globaux de l'animation.
 *
 * Le decoupage de chaque video ne vit PAS ici : il se lit sur la balise
 * `<video>` elle-meme (`data-vb-file`, `data-vb-transition`, `data-vb-end`).
 * Une seule source de verite, le DOM — ajouter un use-case, c'est ajouter une
 * `<video>` et un bouton dans Webflow, sans rebuild.
 *
 * Ce qui suit se surcharge sans rebuild en definissant
 * `window.SCROLL_VIDEO_CONFIG` avant le chargement du script.
 */
export const CONFIG = {
  /** Racine CDN servant les MP4. Doit servir des fichiers bruts, jamais du HLS. */
  base: 'https://temp-virtual-browser.b-cdn.net/scroll-video/v1',

  /**
   * Hauteur d'ecran laissee libre en fin de piste, ou la video boucle dans son
   * cadre. 1 = 100vh de boucle. Voir "La geometrie de la piste" dans le README.
   */
  loopReserve: 1,

  /**
   * Verrouille la boucle une fois atteinte : remonter ne relance plus le scrub.
   * `false` restaure l'aller-retour (remonter rembobine la video).
   */
  latchLoop: true,

  /** Cadence des masters. Convertit les numeros d'image en secondes. */
  fps: 30,

  /** Duree du fondu croise lors d'un changement de use-case, en ms. */
  fadeMs: 250,

  /**
   * Clignement absorbant le recul du passage boucle -> scrub (la boucle peut
   * etre a 4.5 s quand le scroll impose 3.0 s). 0 = cut sec.
   */
  jumpFadeMs: 150,

  /**
   * Plage de progression sur laquelle le fond quitte le plein ecran pour se
   * caler dans `[data-vb-frame]`. Pilote par le scroll : a mi-plage il est a
   * mi-chemin, et remonter le defait. Plage vide = bascule seche.
   */
  dockRange: { start: 0.05, end: 0.65 },

  /** Inertie de GSAP sur le scrub. 0 = collage strict au scroll. */
  scrubSmoothing: 0.4,

  /** Use-case affiche au chargement, s'il existe dans le DOM. */
  defaultActive: 'v1',

  /** Largeurs encodees, de la plus petite a la plus grande. */
  widths: [750, 1280, 1920],

  /** Delai au-dela duquel on se contente des donnees deja bufferisees. */
  preloadTimeoutMs: 8000,

  /** Duree de scrub supposee quand une balise oublie `data-vb-transition`. */
  fallbackScrubSeconds: 3,
};

/** Fusionne les surcharges avec les valeurs par defaut. */
export function resolveConfig(overrides = {}) {
  return {
    ...CONFIG,
    ...overrides,
    dockRange: { ...CONFIG.dockRange, ...(overrides.dockRange ?? {}) },
  };
}

/**
 * Lit le decoupage d'une balise `[data-vb-video]`.
 *
 * Attributs, tous optionnels sauf l'identifiant :
 *  - `data-vb-video`       identifiant, le meme que `data-vb-usecase`
 *  - `data-vb-file`        racine du fichier CDN (`video3` -> video3-1280.mp4)
 *  - `data-vb-transition`  image ou le scrub s'arrete et la boucle commence
 *  - `data-vb-end`         derniere image de la boucle ; a defaut, la fin du fichier
 *  - `data-vb-fps`         cadence, sinon celle de la config
 */
export function describeVideo(element, config = CONFIG) {
  const fps = readNumber(element, 'data-vb-fps') ?? config.fps;
  const transitionFrame = readNumber(element, 'data-vb-transition');
  const endFrame = readNumber(element, 'data-vb-end');

  // Sans `data-vb-transition`, on se rabat sur une duree de scrub par defaut.
  // main.js previent dans la console : c'est presque toujours un oubli.
  const transition = transitionFrame ?? Math.round(config.fallbackScrubSeconds * fps);
  const scrubEnd = transition / fps;
  const id = element.getAttribute('data-vb-video');

  return {
    id,
    file: element.getAttribute('data-vb-file') || id,
    fps,
    transition,
    end: endFrame,
    declared: transitionFrame != null,
    // Boucle ouverte : sa fin reelle n'est connue qu'a la lecture des
    // metadonnees du fichier (voir Mp4VideoLayer._onLoadedMetadata).
    openEnded: endFrame == null,
    segments: {
      scrub: { start: 0, end: scrubEnd },
      loop: {
        start: scrubEnd,
        end: endFrame == null ? Number.POSITIVE_INFINITY : endFrame / fps,
      },
    },
  };
}

/** Toutes les videos declarees dans un conteneur, dans l'ordre du DOM. */
export function collectVideos(root, config = CONFIG) {
  return [...root.querySelectorAll('[data-vb-video]')]
    .filter((element) => element.getAttribute('data-vb-video'))
    .map((element) => ({ element, ...describeVideo(element, config) }));
}

/** URL du MP4 d'un descripteur renvoye par `describeVideo`. */
export function sourceFor(video, width, config = CONFIG) {
  return `${trimSlash(config.base)}/${video.file}-${width}.mp4`;
}

/** URL de l'image fixe utilisee en repli `prefers-reduced-motion`. */
export function posterFor(video, width, config = CONFIG) {
  return `${trimSlash(config.base)}/${video.file}-${width}-poster.jpg`;
}

function readNumber(element, name) {
  const raw = element.getAttribute(name);
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function trimSlash(value) {
  return value.replace(/\/+$/, '');
}
