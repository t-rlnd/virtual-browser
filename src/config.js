/**
 * Point de reglage unique de l'animation.
 *
 * Le decoupage de chaque video ne vit plus ici : il se lit sur la balise
 * elle-meme (`data-vb-transition`, `data-vb-end`, `data-vb-file`). Ajouter un
 * use-case, c'est ajouter une `<video>` et un bouton, sans rebuild.
 *
 * Les autres valeurs peuvent etre surchargees sans rebuild en definissant
 * `window.SCROLL_VIDEO_CONFIG` avant le chargement du script.
 */
export const CONFIG = {
  /** Racine CDN servant les MP4. Doit servir des fichiers bruts, jamais du HLS. */
  base: 'https://REPLACE-ME.b-cdn.net/scroll-video/v1',

  /**
   * Bornes de repli, uniquement si une video n'a ni `data-vb-transition`
   * ni entree dans `videos`. Chaque video declare normalement les siennes.
   */
  scrub: { start: 0, end: 3 },
  loop: { start: 3, end: 6 },

  /** Cadence des masters. Convertit les numeros d'image en secondes. */
  fps: 30,

  /** Duree du fondu croise lors d'un changement de use-case. */
  fadeMs: 250,

  /**
   * Absorbe le recul brutal du passage boucle -> scrub (la boucle peut etre a
   * 4.5 s quand le scroll impose 3.0 s). Mettre a 0 pour un cut sec.
   */
  jumpFadeMs: 150,

  /** Inertie de GSAP sur le scrub. 0 = collage strict au scroll. */
  scrubSmoothing: 0.4,

  /** Use-case affiche au chargement, s'il existe dans le DOM. */
  defaultActive: 'v1',

  /** Largeurs encodees, de la plus petite a la plus grande. */
  widths: [750, 1280, 1920],

  /**
   * Comportement sur pointeur grossier (mobile / tablette).
   *  - 'scrub'    : meme experience que sur desktop
   *  - 'autoplay' : pas de scrub, la video boucle simplement en fond
   */
  mobileMode: 'scrub',

  /** Delai au-dela duquel on se contente des donnees deja bufferisees. */
  preloadTimeoutMs: 8000,

  /**
   * Repli optionnel, au cas ou une balise oublie ses attributs. La source de
   * verite reste le DOM : une video absente d'ici mais presente dans la page
   * fonctionne quand meme.
   */
  videos: {
    v1: { file: 'video1', transition: 166, end: 398 },
    v2: { file: 'video2', transition: 116, end: 247 },
  },
};

/** Fusionne les surcharges avec les valeurs par defaut. */
export function resolveConfig(overrides = {}) {
  const videos = { ...CONFIG.videos };

  for (const [id, video] of Object.entries(overrides.videos ?? {})) {
    videos[id] = { ...(videos[id] ?? {}), ...video };
  }

  return {
    ...CONFIG,
    ...overrides,
    scrub: { ...CONFIG.scrub, ...(overrides.scrub ?? {}) },
    loop: { ...CONFIG.loop, ...(overrides.loop ?? {}) },
    videos,
  };
}

/**
 * Lit le decoupage d'une balise `[data-vb-video]`.
 *
 * Attributs, tous optionnels sauf l'identifiant :
 *  - `data-vb-video`       identifiant, le meme que `data-vb-usecase`
 *  - `data-vb-file`        racine du fichier CDN (`video3` → video3-1280.mp4)
 *  - `data-vb-transition`  numero d'image ou le scrub s'arrete et la boucle commence
 *  - `data-vb-end`         derniere image de la boucle ; a defaut, la duree du fichier
 *  - `data-vb-fps`         cadence, sinon celle de la config
 *
 * Les attributs l'emportent sur `config.videos[id]`.
 */
export function describeVideo(element, config = CONFIG) {
  const id = element.getAttribute('data-vb-video');
  const fallback = config.videos[id] ?? {};
  const fps = readNumber(element, 'data-vb-fps') ?? fallback.fps ?? config.fps;

  const transitionAttr = readNumber(element, 'data-vb-transition');
  const endAttr = readNumber(element, 'data-vb-end');

  const transition =
    transitionAttr ??
    fallback.transition ??
    secondsToFrame(fallback.scrub?.end ?? config.scrub.end, fps);

  const end = endAttr ?? fallback.end ?? secondsToFrame(fallback.loop?.end, fps);

  const declared = transitionAttr != null || fallback.transition != null;
  const scrubEnd = transition / fps;
  const loopEnd = end == null ? Number.POSITIVE_INFINITY : end / fps;

  return {
    id,
    file: element.getAttribute('data-vb-file') || fallback.file || id,
    fps,
    transition,
    end,
    declared,
    openEnded: end == null,
    segments: {
      scrub: { start: 0, end: scrubEnd },
      loop: { start: scrubEnd, end: loopEnd },
    },
  };
}

/** Toutes les videos declarees dans un conteneur, dans l'ordre du DOM. */
export function collectVideos(root, config = CONFIG) {
  return [...root.querySelectorAll('[data-vb-video]')]
    .filter((element) => element.getAttribute('data-vb-video'))
    .map((element) => ({ element, ...describeVideo(element, config) }));
}

/** Bornes d'une video connue uniquement par son identifiant (tests, repli). */
export function segmentsFor(id, config = CONFIG) {
  const fallback = config.videos[id] ?? {};
  const fps = fallback.fps ?? config.fps;
  const transition =
    fallback.transition ?? secondsToFrame(fallback.scrub?.end ?? config.scrub.end, fps);
  const end = fallback.end ?? secondsToFrame(fallback.loop?.end ?? config.loop.end, fps);
  return {
    scrub: { start: 0, end: transition / fps },
    loop: { start: transition / fps, end: end / fps },
  };
}

/** URL du MP4. `video` est un descripteur `{ file }` ou un identifiant. */
export function sourceFor(video, width, config = CONFIG) {
  return `${trimSlash(config.base)}/${fileOf(video, config)}-${width}.mp4`;
}

/** URL de l'image fixe utilisee en fallback prefers-reduced-motion. */
export function posterFor(video, width, config = CONFIG) {
  return `${trimSlash(config.base)}/${fileOf(video, config)}-${width}-poster.jpg`;
}

function fileOf(video, config) {
  if (typeof video !== 'string') return video.file;
  return config.videos[video]?.file ?? video;
}

function readNumber(element, name) {
  const raw = element.getAttribute(name);
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function secondsToFrame(seconds, fps) {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return Math.round(seconds * fps);
}

function trimSlash(value) {
  return value.replace(/\/+$/, '');
}
