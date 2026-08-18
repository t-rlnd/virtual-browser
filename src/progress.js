/**
 * Publication de l'etat du scrub pour la feuille de style.
 *
 * Le montage superpose demande a la page de faire apparaitre et disparaitre
 * ses propres calques au rythme du scrub : le titre s'efface, la section 2 se
 * revele, les pastilles arrivent en fin de course. Rien de tout cela ne
 * regarde le JavaScript — ce sont des choix de mise en scene, qui vivent
 * mieux dans la feuille de style.
 *
 * La variable est posee sur `<html>` et non sur le stage : les calques a
 * animer sont ses freres, pas ses descendants, et n'heriteraient donc de rien.
 *
 * ```css
 * .protocol_intro { opacity: calc(1 - var(--vb-scrub) / 0.2); }
 * ```
 *
 * Le mode y est publie de la meme facon, en attribut cette fois : une opacite
 * s'interpole, un `pointer-events` non. Un calque revele par le scrub reste
 * cliquable a opacite nulle, ce qui laisserait les boutons de use-case capter
 * les clics bien avant d'etre visibles.
 *
 * ```css
 * [data-vb-loop] { pointer-events: none; }
 * :root[data-vb-mode='loop'] [data-vb-loop] { pointer-events: auto; }
 * ```
 */

const VARIABLE = '--vb-scrub';
const MODE_ATTRIBUTE = 'data-vb-mode';

/** Trois decimales : en deca, l'ecriture ne change plus rien a l'ecran. */
const PRECISION = 1000;

export function initProgress({ stage, element = document.documentElement }) {
  let painted = null;

  const paint = (value) => {
    const rounded = Math.round(value * PRECISION) / PRECISION;
    if (rounded === painted) return;
    painted = rounded;
    element.style.setProperty(VARIABLE, String(rounded));
  };

  const mark = (mode) => element.setAttribute(MODE_ATTRIBUTE, mode);

  const offProgress = stage.on('progress', paint);
  const offMode = stage.on('modechange', ({ mode }) => mark(mode));

  paint(stage.progress);
  mark(stage.mode);

  return {
    destroy() {
      offProgress();
      offMode();
      element.style.removeProperty(VARIABLE);
      element.removeAttribute(MODE_ATTRIBUTE);
    },
  };
}
