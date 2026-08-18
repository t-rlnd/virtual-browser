/**
 * Selecteur de use-case.
 *
 * Ne decide de rien : il mute `activeId` sur le Stage et se contente de
 * refleter l'etat renvoye par celui-ci. L'etat visuel suit donc toujours la
 * video reellement affichee, y compris si une bascule est annulee.
 */
export function initUseCases({ stage, root = document }) {
  const buttons = Array.from(root.querySelectorAll('[data-vb-usecase]'));

  if (buttons.length === 0) {
    console.warn('[scroll-video] aucun element [data-vb-usecase] trouve');
    return { destroy() {} };
  }

  const sync = (activeId) => {
    for (const button of buttons) {
      const isActive = button.dataset.vbUsecase === activeId;
      button.setAttribute('aria-pressed', String(isActive));
      button.classList.toggle('is-active', isActive);
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

  const off = stage.on('activechange', sync);
  sync(stage.activeId);

  return {
    destroy() {
      off();
      for (const button of buttons) {
        button.removeEventListener('click', onClick);
        button.removeEventListener('keydown', onKeydown);
      }
    },
  };
}
