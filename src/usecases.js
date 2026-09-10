import { MODES } from './Stage.js';

/** Pose sur le bouton du use-case affiche. La page se stylise dessus. */
const ACTIVE_ATTRIBUTE = 'data-vb-active';

/**
 * Selecteur de use-case.
 *
 * Ne decide de rien : il mute `activeId` sur le Stage et se contente de
 * refleter l'etat renvoye par celui-ci. L'etat visuel suit donc toujours la
 * video reellement affichee, y compris si une bascule est annulee.
 *
 * Deuxieme role, purement descriptif lui aussi : refleter l'avancee de la
 * serie de tours sur les elements `[data-vb-progress]`, dont la largeur va
 * de 0 a 100 % sur l'ensemble des `loopRepeats` (pas un tour isole).
 */
export function initUseCases({ stage, root = document }) {
  const buttons = Array.from(root.querySelectorAll('[data-vb-usecase]'));

  if (buttons.length === 0) {
    console.warn('[scroll-video] aucun element [data-vb-usecase] trouve');
    return { destroy() {} };
  }

  const bars = collectBars(root);

  const sync = (activeId) => {
    for (const button of buttons) {
      const isActive = button.dataset.vbUsecase === activeId;
      button.setAttribute(ACTIVE_ATTRIBUTE, String(isActive));
      button.setAttribute('aria-pressed', String(isActive));
      button.classList.toggle('is-active', isActive);
      // La barre d'un use-case qu'on quitte ne doit pas rester figee a
      // mi-course : seule celle du use-case affiche a un sens.
      if (!isActive) paint(bars, button.dataset.vbUsecase, 0);
    }
  };

  const select = (element) => {
    const id = element.dataset.vbUsecase;
    if (id) stage.setActive(id);
  };

  const onClick = (event) => {
    event.preventDefault();
    select(event.currentTarget);
  };

  const onKeydown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
    event.preventDefault();
    select(event.currentTarget);
  };

  for (const button of buttons) {
    button.addEventListener('click', onClick);

    // Webflow produit rarement de vrais <button> : on complete ce qui manque
    // pour que le clavier fonctionne.
    if (button.tagName !== 'BUTTON') {
      if (!button.hasAttribute('role')) button.setAttribute('role', 'button');
      if (!button.hasAttribute('tabindex')) button.setAttribute('tabindex', '0');
      button.addEventListener('keydown', onKeydown);
    }
  }

  // --- Avancee de la boucle -------------------------------------------------

  let raf = 0;

  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(tick);
  };

  const stop = () => {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  };

  /**
   * La position lue est celle de la video, etapee par le Stage sur toute la
   * serie de tours : la barre ne rembobine plus a chaque passage.
   */
  function tick() {
    raf = 0;
    if (stage.mode !== MODES.LOOP) return;

    paint(bars, stage.activeId, stage.loopProgress);
    schedule();
  }

  const onMode = ({ mode }) => {
    if (mode === MODES.LOOP) {
      schedule();
      return;
    }
    // Hors boucle il n'y a pas d'avancee a montrer : on repart de zero, la
    // prochaine entree en boucle recommence au debut du segment.
    stop();
    for (const id of bars.keys()) paint(bars, id, 0);
  };

  const offActive = stage.on('activechange', sync);
  const offMode = stage.on('modechange', onMode);

  for (const id of bars.keys()) paint(bars, id, 0);
  sync(stage.activeId);
  if (stage.mode === MODES.LOOP) schedule();

  return {
    destroy() {
      offActive();
      offMode();
      stop();
      for (const button of buttons) {
        button.removeEventListener('click', onClick);
        button.removeEventListener('keydown', onKeydown);
      }
    },
  };
}

/**
 * Une barre appartient au use-case qui la contient. Le cas ou elle vit
 * ailleurs dans la page reste possible en nommant le use-case dans l'attribut :
 * `data-vb-progress="v1"`.
 */
function collectBars(root) {
  const bars = new Map();

  for (const element of root.querySelectorAll('[data-vb-progress]')) {
    const id =
      element.getAttribute('data-vb-progress') ||
      element.closest('[data-vb-usecase]')?.dataset.vbUsecase;

    if (!id) {
      console.warn(
        '[scroll-video] [data-vb-progress] hors d\'un [data-vb-usecase] et sans valeur : ignore'
      );
      continue;
    }

    if (!bars.has(id)) bars.set(id, []);
    bars.get(id).push(element);
  }

  return bars;
}

/** @param {number} value 0 a 1 */
function paint(bars, id, value) {
  const elements = bars.get(id);
  if (!elements) return;

  const percent = `${(value * 100).toFixed(2)}%`;
  for (const element of elements) {
    element.style.width = percent;
    // Publie aussi la valeur brute : de quoi animer autre chose que la
    // largeur — une opacite, un compteur — sans repasser par le JS.
    element.style.setProperty('--vb-progress', value.toFixed(4));
  }
}
