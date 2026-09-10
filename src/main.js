import { resolveConfig, sourceFor, posterFor, collectVideos } from './config.js';
import { Mp4VideoLayer } from './layers/Mp4VideoLayer.js';
import { Stage } from './Stage.js';
import { initPlayback } from './playback.js';
import { initFrame } from './frame.js';
import { initProgress, paintCurrent } from './progress.js';
import { initUseCases } from './usecases.js';
import { pickWidth, prefersReducedMotion, isCompactViewport } from './env.js';

const STATE_ATTRIBUTE = 'data-vb-state';

function setState(state) {
  document.documentElement.setAttribute(STATE_ATTRIBUTE, state);
}

export async function init(config = resolveConfig(window.SCROLL_VIDEO_CONFIG)) {
  const stageElement = document.querySelector('[data-vb-stage]');
  const track = document.querySelector('[data-vb-scrub]');

  if (!stageElement || !track) {
    console.warn(
      '[scroll-video] [data-vb-stage] ou [data-vb-scrub] introuvable, animation desactivee'
    );
    setState('error');
    return null;
  }

  warnIfStatic(stageElement);

  setState('loading');
  const width = pickWidth(config.widths);

  if (prefersReducedMotion()) {
    const activeId = showPoster(stageElement, config, width);
    if (activeId) paintCurrent(activeId);
    setState('reduced');
    return null;
  }

  const layers = buildLayers(stageElement, config, width);
  const defaultActive = layers[config.defaultActive]
    ? config.defaultActive
    : Object.keys(layers)[0];

  if (!defaultActive) {
    console.error('[scroll-video] aucune balise [data-vb-video] dans le stage');
    setState('error');
    return null;
  }

  config = { ...config, defaultActive };
  const stage = new Stage({ layers, config });

  // En compact la progression est figee a 1 : mount pose alors la couche
  // sur le debut de la boucle, pas sur la premiere image du scrub.
  if (isCompactViewport(config.compactMaxWidth)) stage.setProgress(1);

  // Arme le deblocage iOS avant tout chargement : sur iOS le decodeur reste
  // inerte tant qu'aucune lecture n'a ete autorisee, et les seeks ne rendent rien.
  installUnlock(stage, layers);

  try {
    await layers[config.defaultActive].preload();
  } catch (error) {
    console.error('[scroll-video]', error);
    setState('error');
    return null;
  }

  stage.mount();

  // Avant initPlayback : c'est lui qui pose la progression initiale, et le
  // cadrage comme la variable CSS doivent etre en place pour l'entendre.
  const progress = initProgress({ stage });
  const frame = initFrame({ stage, config, stageElement });

  const playback = initPlayback({ stage, config, track });
  const useCases = initUseCases({ stage });

  setState('ready');

  preloadOnApproach(
    Object.values(layers).filter((layer) => layer.id !== config.defaultActive),
    track
  );

  const api = {
    stage,
    destroy() {
      playback.destroy();
      useCases.destroy();
      frame.destroy();
      progress.destroy();
      stage.destroy();
    },
  };

  window.scrollVideo = api;
  return api;
}

/**
 * Les couches sont en `position: absolute` : un stage reste `static` les
 * laisserait se caler sur le premier ancetre positionne, souvent le body. La
 * panne est visuelle et silencieuse, autant la nommer.
 */
function warnIfStatic(stageElement) {
  if (getComputedStyle(stageElement).position !== 'static') return;
  console.warn(
    '[scroll-video] [data-vb-stage] est en position: static — lui donner fixed, sticky, absolute ou relative, sinon les couches video se caleront ailleurs'
  );
}

function buildLayers(stageElement, config, width) {
  const layers = {};

  for (const video of collectVideos(stageElement, config)) {
    if (!video.declared) {
      console.warn(
        `[scroll-video] [data-vb-video="${video.id}"] sans data-vb-transition, repli sur ${video.transition} images`
      );
    }

    layers[video.id] = new Mp4VideoLayer({
      id: video.id,
      element: video.element,
      src: sourceFor(video, width, config),
      segments: video.segments,
      fps: video.fps,
      openEnded: video.openEnded,
      preloadTimeoutMs: config.preloadTimeoutMs,
    });
  }

  return layers;
}

/** Fallback prefers-reduced-motion : image fixe, aucune video chargee. */
function showPoster(stageElement, config, width) {
  const videos = collectVideos(stageElement, config);
  const video =
    videos.find((entry) => entry.id === config.defaultActive) ?? videos[0];
  if (!video) return null;

  const { element } = video;
  element.poster = posterFor(video, width, config);
  element.removeAttribute('src');
  element.style.visibility = 'visible';
  element.style.opacity = '1';
  return video.id;
}

/**
 * Le tout premier geste peut survenir avant que la source ne soit chargee,
 * auquel cas play() echoue. Les ecouteurs restent donc en place jusqu'a un
 * deblocage reellement reussi.
 */
function installUnlock(stage, layers) {
  const events = ['pointerdown', 'touchstart', 'keydown'];

  const unlock = async () => {
    const unlocked = await Promise.all(Object.values(layers).map((layer) => layer.unlock()));
    stage.refresh();
    if (unlocked.every(Boolean)) {
      for (const event of events) window.removeEventListener(event, unlock);
    }
  };

  for (const event of events) window.addEventListener(event, unlock, { passive: true });
}

/**
 * La seconde video pese autant que la premiere, et un visiteur qui n'atteint
 * jamais la section 2 n'en a aucun usage. On ne la charge donc qu'a l'approche
 * de la piste, ou des qu'un use-case est survole — ce qui arrive toujours avant
 * le clic. La section 2 etant superposee, c'est bien la piste qu'on observe :
 * la viser elle ferait partir le telechargement au premier pixel de scrub.
 */
function preloadOnApproach(layers, track) {
  if (layers.length === 0) return;

  let started = false;
  const run = () => {
    if (started) return;
    started = true;
    observer?.disconnect();
    for (const button of document.querySelectorAll('[data-vb-usecase]')) {
      button.removeEventListener('pointerenter', run);
    }
    for (const layer of layers) {
      layer.preload().catch((error) => console.warn('[scroll-video]', error));
    }
  };

  // Une pleine hauteur d'ecran d'avance laisse le temps du telechargement.
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) run();
    },
    { rootMargin: '100% 0px' }
  );
  observer.observe(track);

  for (const button of document.querySelectorAll('[data-vb-usecase]')) {
    button.addEventListener('pointerenter', run, { passive: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => init(), { once: true });
} else {
  init();
}
