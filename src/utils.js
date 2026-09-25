export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function clamp01(value) {
  return clamp(value, 0, 1);
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Emetteur d'evenements minimal, suffisant pour synchroniser l'UI sur l'etat. */
export class Emitter {
  constructor() {
    this._listeners = new Map();
  }

  on(event, callback) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const set = this._listeners.get(event);
    if (set) set.delete(callback);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const callback of set) {
      try {
        callback(payload);
      } catch (error) {
        console.error(`[scroll-video] listener "${event}" a echoue`, error);
      }
    }
  }
}

/**
 * Rend un element activable a la souris et au clavier. Webflow produit
 * rarement de vrais <button> : on complete ce qui manque (role, focus,
 * Entree/Espace). Renvoie la fonction qui retire les ecouteurs.
 */
export function bindPress(element, onPress) {
  const onClick = (event) => {
    event.preventDefault();
    onPress(event.currentTarget);
  };

  const onKeydown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
    event.preventDefault();
    onPress(event.currentTarget);
  };

  element.addEventListener('click', onClick);

  const native = element.tagName === 'BUTTON';
  if (!native) {
    if (!element.hasAttribute('role')) element.setAttribute('role', 'button');
    if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '0');
    element.addEventListener('keydown', onKeydown);
  }

  return () => {
    element.removeEventListener('click', onClick);
    if (!native) element.removeEventListener('keydown', onKeydown);
  };
}
