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
