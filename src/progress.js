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
 *
 * Le use-case actif est publie de la meme maniere (`data-vb-current` sur
 * `<html>`), et reflechi sur chaque `[data-vb-when]` via `data-vb-shown`.
 * Le script ne decide pas de l'apparence : il pose l'etat, la feuille masque
 * les piles inactives. Voir `paintCurrent`.
 */

const VARIABLE = '--vb-scrub';
const MODE_ATTRIBUTE = 'data-vb-mode';
const CURRENT_ATTRIBUTE = 'data-vb-current';
const SHOWN_ATTRIBUTE = 'data-vb-shown';

/** Trois decimales : en deca, l'ecriture ne change plus rien a l'ecran. */
const PRECISION = 1000;

/**
 * Pose le use-case affiche sur `<html>` et sur chaque `[data-vb-when]`.
 *
 * Appelable sans Stage — le chemin `prefers-reduced-motion` n'en a pas, mais
 * les piles de cards doivent quand meme montrer le use-case par defaut.
 *
 * `data-vb-when="v1 v2"` (espaces ou virgules) montre l'element pour chacun.
 */
export function paintCurrent(activeId, { element, root, when } = {}) {
  const html = element ?? document.documentElement;
  html.setAttribute(CURRENT_ATTRIBUTE, activeId);

  const items = when ?? collectWhen(root ?? document);
  for (const item of items) {
    item.node.setAttribute(SHOWN_ATTRIBUTE, String(item.ids.includes(activeId)));
  }

  return items;
}

export function initProgress({ stage, element, root } = {}) {
  let painted = null;
  const html = element ?? document.documentElement;
  const when = collectWhen(root ?? document);

  const paint = (value) => {
    const rounded = Math.round(value * PRECISION) / PRECISION;
    if (rounded === painted) return;
    painted = rounded;
    html.style.setProperty(VARIABLE, String(rounded));
  };

  const mark = (mode) => html.setAttribute(MODE_ATTRIBUTE, mode);
  const markCurrent = (activeId) => paintCurrent(activeId, { element: html, when });

  const offProgress = stage.on('progress', paint);
  const offMode = stage.on('modechange', ({ mode }) => mark(mode));
  const offActive = stage.on('activechange', markCurrent);

  paint(stage.progress);
  mark(stage.mode);
  markCurrent(stage.activeId);

  return {
    destroy() {
      offProgress();
      offMode();
      offActive();
      html.style.removeProperty(VARIABLE);
      html.removeAttribute(MODE_ATTRIBUTE);
      html.removeAttribute(CURRENT_ATTRIBUTE);
      for (const item of when) item.node.removeAttribute(SHOWN_ATTRIBUTE);
    },
  };
}

function collectWhen(root) {
  const items = [];

  for (const node of root.querySelectorAll('[data-vb-when]')) {
    const ids = parseWhen(node.getAttribute('data-vb-when'));
    if (ids.length === 0) {
      console.warn('[scroll-video] [data-vb-when] sans valeur : ignore');
      continue;
    }
    items.push({ node, ids });
  }

  return items;
}

function parseWhen(raw) {
  if (raw == null || raw.trim() === '') return [];
  return raw.trim().split(/[\s,]+/).filter(Boolean);
}
