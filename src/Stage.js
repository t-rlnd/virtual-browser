import { Emitter, clamp01, wait } from './utils.js';

export const MODES = {
  /** Section 1 : couche en pause, image dictee par la position de scroll. */
  SCRUB: 'scrub',
  /** Section 2 visible : lecture autonome en boucle sur le sous-segment. */
  LOOP: 'loop',
  /** Section 2 hors ecran : tout est en pause. */
  IDLE: 'idle',
};

/**
 * Machine a etats du fond video.
 *
 * Trois variables suffisent a decrire l'experience : quelle couche est active,
 * dans quel mode elle se trouve, et ou en est le scroll. Le scroll et les clics
 * ne font que muter cet etat ; c'est ici qu'on en deduit ce que les couches
 * doivent faire.
 *
 * C'est ce decouplage qui rend la retroactivite gratuite : changer `activeId`
 * ne touche ni `mode` ni `progress`, donc remonter vers la section 1 apres un
 * clic scrube naturellement la nouvelle video.
 *
 * Le Stage ne touche jamais au DOM directement, uniquement aux couches.
 */
export class Stage extends Emitter {
  constructor({ layers, config }) {
    super();

    this.layers = layers;
    this.config = config;
    this.activeId = config.defaultActive;
    this.mode = MODES.IDLE;
    this.progress = 0;

    // Tours du segment boucle deja joues sur la couche active. Remis a zero
    // a chaque entree en LOOP et a chaque bascule de use-case.
    this._loopCount = 0;

    // Jeton d'annulation : toute nouvelle transition invalide les precedentes,
    // dont les etapes asynchrones peuvent encore etre en vol.
    this._transition = 0;
  }

  get active() {
    return this.layers[this.activeId];
  }

  /**
   * Avancee dans la serie de tours, de 0 a 1. Avec `loopRepeats: 2`, 0.5 est
   * la fin du premier tour ; 1 est la fin du second. En boucle infinie, un
   * seul tour : 0 a 1, puis ca recommence.
   */
  get loopProgress() {
    const layer = this.active;
    if (!layer) return 0;

    const { start, end } = layer.segments.loop;
    const span = end - start;
    const inCycle = span > 0 ? clamp01(((layer.currentTime ?? start) - start) / span) : 0;
    const repeats = this.config.loopRepeats;
    if (!Number.isFinite(repeats) || repeats < 1) return inCycle;
    return clamp01((this._loopCount + inCycle) / repeats);
  }

  /** Place la couche active a l'image correspondant a la position de scroll initiale. */
  mount() {
    for (const [id, layer] of Object.entries(this.layers)) {
      if (id === this.activeId) continue;
      layer.setDepth(0);
      layer.hide(0);
      layer.pause();
    }

    const layer = this.active;
    layer.setDepth(1);
    layer.hardSeek(this.timeForProgress(this.progress));
    layer.show(0);
  }

  /**
   * Les videos n'ayant pas la meme duree d'intro, la progression est mappee
   * sur les bornes de la couche concernee, pas sur des bornes globales.
   * C'est ce qui les garde perceptuellement synchrones a la bascule.
   */
  timeForProgress(progress, layer = this.active) {
    return layer.timeForProgress(clamp01(progress));
  }

  /**
   * La progression est aussi emise, et pas seulement stockee : le recadrage et
   * la publication de `--vb-scrub` s'y accrochent. Elle est emise meme hors
   * mode scrub, un verrou de boucle devant figer l'habillage la ou il en est
   * plutot que de le laisser sur une valeur perimee.
   */
  setProgress(progress) {
    this.progress = clamp01(progress);
    this.emit('progress', this.progress);
    if (this.mode !== MODES.SCRUB) return;
    this.active.seek(this.timeForProgress(this.progress));
  }

  setMode(mode) {
    if (mode === this.mode) return;

    const previous = this.mode;
    this.mode = mode;
    this.emit('modechange', { mode, previous });

    if (mode === MODES.SCRUB) return this._enterScrub(previous);
    if (mode === MODES.LOOP) return this._enterLoop();
    return this._enterIdle();
  }

  /**
   * Bascule de use-case. La video entrante repart au debut de la boucle, quel
   * que soit l'endroit ou en etait la sortante ; le fondu absorbe l'ecart.
   */
  async setActive(id) {
    if (!this.layers[id] || id === this.activeId) return;

    const token = ++this._transition;
    const from = this.active;
    const to = this.layers[id];
    const { fadeMs } = this.config;
    const loop = to.segments.loop;
    const previousCount = this._loopCount;

    this._loopCount = 0;
    this.activeId = id;
    this.emit('activechange', id);

    try {
      await to.preload();
    } catch (error) {
      console.error('[scroll-video] bascule annulee', error);
      this.activeId = from.id;
      this._loopCount = previousCount;
      this.emit('activechange', from.id);
      return;
    }
    if (token !== this._transition) return;

    to.hardSeek(this.mode === MODES.LOOP ? loop.start : this.timeForProgress(this.progress, to));
    await to.waitForFrame();
    if (token !== this._transition) return;

    // La couche entrante monte en opacite par-dessus la sortante restee opaque.
    // Les faire varier en sens inverse laisserait apparaitre le fond a mi-fondu.
    from.setDepth(0);
    to.setDepth(1);
    to.show(fadeMs);

    if (this.mode === MODES.LOOP) this._playActiveLoop(to);

    await wait(fadeMs);
    if (this.activeId === from.id) return;
    from.hide(0);
    from.pause();
  }

  /**
   * Reapplique l'etat courant a toutes les couches. Sert apres le deblocage
   * iOS, qui lance brievement la lecture de chacune d'elles : c'est ici, et
   * nulle part ailleurs, qu'on les remet dans l'etat decrit par la machine.
   */
  refresh() {
    for (const [id, layer] of Object.entries(this.layers)) {
      if (id !== this.activeId) layer.pause();
    }

    const layer = this.active;
    if (this.mode === MODES.LOOP) {
      this._playActiveLoop(layer);
    } else if (this.mode === MODES.SCRUB) {
      layer.pause();
      layer.hardSeek(this.timeForProgress(this.progress));
    } else {
      layer.pause();
    }
  }

  async _enterScrub(previous) {
    const token = ++this._transition;
    this._loopCount = 0;
    const layer = this.active;
    layer.pause();

    const fadeMs = this.config.jumpFadeMs;

    if (previous !== MODES.LOOP || fadeMs <= 0) {
      layer.hardSeek(this.timeForProgress(this.progress));
      layer.show(0);
      return;
    }

    // La boucle peut etre a 4.5 s au moment ou le scroll impose 3.0 s. Plutot
    // que de montrer ce recul d'une seconde et demie, on cligne.
    layer.hide(fadeMs / 2);
    await wait(fadeMs / 2);
    if (token !== this._transition) return;

    layer.hardSeek(this.timeForProgress(this.progress));
    await layer.waitForFrame();
    if (token !== this._transition) return;

    layer.show(fadeMs / 2);
  }

  _enterLoop() {
    this._transition += 1;
    this._loopCount = 0;
    const layer = this.active;
    layer.show(0);
    this._playActiveLoop(layer);
  }

  _enterIdle() {
    this._transition += 1;
    this._loopCount = 0;
    for (const layer of Object.values(this.layers)) layer.pause();
  }

  _playActiveLoop(layer = this.active) {
    const { start, end } = layer.segments.loop;
    layer.playLoop(start, end, () => this._onLoopCycle(layer.id));
  }

  /**
   * Un tour du segment boucle vient de s'achever sur `id`.
   * `false` : figer la derniere image, le Stage enchaine le use-case suivant.
   * On ignore les tours d'une couche qui n'est plus active (fondu en cours).
   */
  _onLoopCycle(id) {
    if (this.mode !== MODES.LOOP || id !== this.activeId) return true;

    this._loopCount += 1;
    const repeats = this.config.loopRepeats;
    if (!Number.isFinite(repeats) || repeats < 1 || this._loopCount < repeats) {
      return true;
    }

    const nextId = this._nextId();
    if (nextId === this.activeId) {
      this._loopCount = 0;
      return true;
    }

    this.setActive(nextId);
    return false;
  }

  _nextId() {
    const ids = Object.keys(this.layers);
    const index = ids.indexOf(this.activeId);
    return ids[(index + 1) % ids.length];
  }

  destroy() {
    this._transition += 1;
    for (const layer of Object.values(this.layers)) layer.destroy();
  }
}
