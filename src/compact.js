import { MODES } from './Stage.js';

/**
 * Cablage du mode compact (tablette et mobile).
 *
 * Pas de ScrollTrigger : la progression est figee a 1 (video deja calee
 * dans `[data-vb-frame]`, `--vb-scrub` a fond) et seul un observateur de
 * visibilite decide entre boucle et pause. Le segment lu est celui de la
 * boucle, l'intro scrubee n'est jamais jouee.
 *
 * La cible observee est `[data-vb-loop]` (la section demo) : c'est elle
 * qui quitte l'ecran, pas la piste entiere qui contient aussi l'intro.
 */
export function initCompact({ stage, root = document }) {
  const target =
    root.querySelector('[data-vb-loop]') ??
    root.querySelector('[data-vb-frame]') ??
    root.querySelector('[data-vb-scrub]');

  stage.setProgress(1);

  if (!target || typeof IntersectionObserver !== 'function') {
    stage.setMode(MODES.LOOP);
    return { destroy() {} };
  }

  const sync = (visible) => {
    stage.setMode(visible ? MODES.LOOP : MODES.IDLE);
  };

  // L'observateur ne se prononce pas tout de suite : on lit l'etat initial
  // nous-memes, comme `initScroll` le fait avec ScrollTrigger.refresh().
  sync(isInViewport(target));

  const observer = new IntersectionObserver(
    (entries) => {
      sync(entries.some((entry) => entry.isIntersecting));
    },
    { threshold: 0 }
  );
  observer.observe(target);

  return {
    destroy() {
      observer.disconnect();
    },
  };
}

function isInViewport(element) {
  const view = typeof window === 'undefined' ? 0 : window.innerHeight;
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < view;
}
