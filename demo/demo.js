/**
 * Page de demonstration locale.
 *
 * Par defaut elle tourne sur DebugLayer, donc sans aucun fichier video : c'est
 * ce qui permet de valider le scroll, les modes et la bascule de use-case
 * avant d'avoir encode quoi que ce soit.
 *
 * Ajouter `?real` a l'URL pour utiliser les vrais MP4 definis dans la config.
 */
import { resolveConfig, sourceFor, collectVideos } from '../src/config.js';
import { Stage } from '../src/Stage.js';
import { Mp4VideoLayer } from '../src/layers/Mp4VideoLayer.js';
import { initPlayback } from '../src/playback.js';
import { initFrame } from '../src/frame.js';
import { initProgress } from '../src/progress.js';
import { initUseCases } from '../src/usecases.js';
import { isCompactViewport } from '../src/env.js';
import { DebugLayer } from './DebugLayer.js';

const useRealVideos = new URLSearchParams(location.search).has('real');

const config = resolveConfig({
  base: useRealVideos ? '/public/assets' : undefined,
  ...(window.SCROLL_VIDEO_CONFIG ?? {}),
});

const stageElement = document.querySelector('[data-vb-stage]');

if (useRealVideos) {
  for (const element of stageElement.querySelectorAll('canvas')) element.remove();
} else {
  for (const element of stageElement.querySelectorAll('video')) element.remove();
}

const layers = {};

for (const video of collectVideos(stageElement, config)) {
  const { id, element, segments, fps, openEnded } = video;
  // Le CSS cible [data-vb-video] : les canvas de debug en ont besoin aussi.
  element.setAttribute('data-vb-video', id);

  layers[id] = useRealVideos
    ? new Mp4VideoLayer({
        id,
        element,
        segments,
        src: sourceFor(video, 1280, config),
        fps,
        openEnded,
      })
    : new DebugLayer({
        id,
        element,
        segments,
        duration: Number.isFinite(segments.loop.end) ? segments.loop.end : segments.scrub.end + 3,
      });
}

const defaultActive = layers[config.defaultActive]
  ? config.defaultActive
  : Object.keys(layers)[0];

const stage = new Stage({ layers, config: { ...config, defaultActive } });

if (isCompactViewport(config.compactMaxWidth)) stage.setProgress(1);

Promise.all(Object.values(layers).map((layer) => layer.preload()))
  .then(() => {
    stage.mount();
    initProgress({ stage });
    const frame = initFrame({ stage, config, stageElement });
    initPlayback({
      stage,
      config,
      track: document.querySelector('[data-vb-scrub]'),
    });
    initUseCases({ stage });
    document.documentElement.setAttribute('data-vb-state', 'ready');
    startHud(stage, frame);
  })
  .catch((error) => {
    console.error(error);
    document.documentElement.setAttribute('data-vb-state', 'error');
  });

/** Affiche l'etat interne en direct, pour pouvoir le verifier a l'oeil. */
function startHud(stage, frame) {
  const hud = document.querySelector('[data-hud]');
  const fields = {
    mode: hud.querySelector('[data-hud-mode]'),
    active: hud.querySelector('[data-hud-active]'),
    progress: hud.querySelector('[data-hud-progress]'),
    time: hud.querySelector('[data-hud-time]'),
    dock: hud.querySelector('[data-hud-dock]'),
    layout: hud.querySelector('[data-hud-layout]'),
  };

  const render = () => {
    fields.mode.textContent = stage.mode;
    fields.active.textContent = stage.activeId;
    fields.progress.textContent = stage.progress.toFixed(3);
    fields.time.textContent = (stage.active.currentTime ?? 0).toFixed(3);
    fields.dock.textContent = (frame.progress ?? 0).toFixed(3);
    if (fields.layout) {
      fields.layout.textContent = document.documentElement.hasAttribute('data-vb-compact')
        ? 'compact'
        : 'desktop';
    }
    requestAnimationFrame(render);
  };

  render();
}

window.scrollVideo = { stage, layers };
