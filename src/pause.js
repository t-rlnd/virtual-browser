import { bindPress } from './utils.js';

const DEFAULT_LABEL = 'Mettre la vidéo en pause';

/**
 * Bouton Pause/Play de la boucle.
 *
 * Comme le selecteur de use-case, il ne decide de rien : il demande une
 * bascule au Stage et ne reflete l'etat qu'au retour de `pausechange`.
 *
 * Bouton a bascule au sens ARIA : le libelle reste constant (« pause ») et
 * `aria-pressed` dit s'il est enfonce. Le choix de l'icone affichee vit dans
 * `scene.css`, a partir de `data-vb-paused` pose sur `<html>`.
 */
export function initPause({ stage, root = document }) {
  const buttons = Array.from(root.querySelectorAll('[data-vb-pause]'));
  if (buttons.length === 0) return { destroy() {} };

  const toggle = () => stage.setPaused(!stage.paused);

  const sync = (paused) => {
    for (const button of buttons) button.setAttribute('aria-pressed', String(paused));
  };

  for (const button of buttons) {
    // Un bouton fait d'icones seules n'a aucun nom pour un lecteur d'ecran.
    if (!button.hasAttribute('aria-label') && !button.textContent.trim()) {
      button.setAttribute('aria-label', DEFAULT_LABEL);
    }
  }

  const unbinds = buttons.map((button) => bindPress(button, toggle));
  const offPause = stage.on('pausechange', sync);
  sync(stage.paused);

  return {
    destroy() {
      offPause();
      for (const unbind of unbinds) unbind();
    },
  };
}
