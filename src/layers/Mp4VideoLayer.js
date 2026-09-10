import { VideoLayer } from './VideoLayer.js';
import { clamp, wait } from '../utils.js';

/** Safari avale parfois un evenement `seeked` : sans garde-fou la file se bloque. */
const SEEK_WATCHDOG_MS = 500;

/** Au-dela, on considere qu'aucune image nouvelle n'arrivera. */
const FRAME_WAIT_TIMEOUT_MS = 400;

/**
 * Couche adossee a une balise <video> et a un MP4 encode all-intra sur sa
 * plage scrubee.
 */
export class Mp4VideoLayer extends VideoLayer {
  constructor({
    id,
    element,
    src,
    segments,
    fps = 30,
    preloadTimeoutMs = 8000,
    openEnded = false,
  }) {
    super(id, segments);

    this.element = element;
    this._src = src;
    this._preloadTimeoutMs = preloadTimeoutMs;
    this._openEnded = openEnded;
    // Un ecart inferieur a une demi-image ne produirait aucun changement visible.
    this._frameEpsilon = 1 / (fps * 2);

    this._readyPromise = null;
    this._unlocked = false;

    this._seekTarget = null;
    this._seekPending = false;
    this._seekWatchdog = 0;

    this._loop = null;
    this._loopHandle = null;
    this._onCycle = null;

    this._visible = false;
    this._visibilityTimer = 0;

    this._onSeeked = this._onSeeked.bind(this);
    this._onLoadedMetadata = this._onLoadedMetadata.bind(this);
    this._onEnded = this._onEnded.bind(this);

    element.addEventListener('seeked', this._onSeeked);
    element.addEventListener('loadedmetadata', this._onLoadedMetadata);
    element.addEventListener('ended', this._onEnded);

    this._applyAttributes();
  }

  get currentTime() {
    return this.element.currentTime;
  }

  /**
   * Ces attributs conditionnent l'autoplay et le rendu inline sur iOS. Les
   * poser depuis le JS evite qu'un oubli dans le Designer casse la page.
   */
  _applyAttributes() {
    const video = this.element;
    // Le CDN sert les MP4 depuis une autre origine que la page. Sans cette
    // ligne tout canvas lisant ces pixels est teinte : la verification de
    // rendu du test e2e echoue, et la migration vers un rendu canvas serait
    // impossible. Suppose un `Access-Control-Allow-Origin` sur le CDN, ce que
    // scripts/check-cdn.sh verifie.
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.loop = false;
    video.controls = false;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
  }

  preload() {
    if (this._readyPromise) return this._readyPromise;

    const video = this.element;
    this._readyPromise = new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener('canplaythrough', succeed);
        video.removeEventListener('error', abort);
      };

      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(this);
      };

      const abort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`[scroll-video] chargement impossible : ${this._src}`));
      };

      // iOS ignore preload="auto" tant qu'aucun geste n'a autorise la lecture.
      // Passe le delai, on se contente de ce qui est deja decode.
      const timer = setTimeout(() => {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) succeed();
        else abort();
      }, this._preloadTimeoutMs);

      video.addEventListener('canplaythrough', succeed);
      video.addEventListener('error', abort);

      if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        succeed();
        return;
      }

      video.src = this._src;
      video.load();
    });

    return this._readyPromise;
  }

  /**
   * Une lecture, et rien de plus : c'est `Stage.refresh()` qui remet ensuite
   * chaque couche dans l'etat que decrit la machine a etats. Restaurer la
   * position ici la mettrait en concurrence avec une bascule de use-case
   * declenchee par le meme clic, et la couche entrante resterait figee.
   */
  async unlock() {
    if (this._unlocked) return true;

    try {
      const started = this.element.play();
      if (started) await started;
      this._unlocked = true;
    } catch (error) {
      // Geste trop precoce, ou source pas encore chargee : l'appelant garde
      // ses ecouteurs en place et rejouera au prochain geste.
    }

    return this._unlocked;
  }

  // --- Seek ---------------------------------------------------------------

  seek(time) {
    this._seekTarget = time;
    if (!this._seekPending) this._drainSeek();
  }

  hardSeek(time) {
    clearTimeout(this._seekWatchdog);
    this._seekPending = false;

    const video = this.element;
    if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
      // Les metadonnees manquent : on rejouera depuis `loadedmetadata`.
      this._seekTarget = time;
      return;
    }

    this._seekTarget = null;
    try {
      video.currentTime = this._clampToMedia(time);
    } catch (error) {
      console.warn('[scroll-video] seek refuse', error);
    }
  }

  /**
   * Emet un seek a la fois. Sans cette serialisation, un scroll rapide empile
   * les demandes et Safari finit par ne plus rien rendre du tout.
   */
  _drainSeek() {
    const video = this.element;

    if (this._seekTarget === null) {
      this._seekPending = false;
      return;
    }
    if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
      this._seekPending = false;
      return;
    }

    const target = this._clampToMedia(this._seekTarget);
    this._seekTarget = null;

    if (Math.abs(target - video.currentTime) < this._frameEpsilon) {
      this._seekPending = false;
      return;
    }

    this._seekPending = true;
    clearTimeout(this._seekWatchdog);
    this._seekWatchdog = setTimeout(() => {
      this._seekPending = false;
      this._drainSeek();
    }, SEEK_WATCHDOG_MS);

    try {
      video.currentTime = target;
    } catch (error) {
      this._seekPending = false;
    }
  }

  _clampToMedia(time) {
    const duration = this.element.duration;
    const max = Number.isFinite(duration) ? duration - this._frameEpsilon : Number.POSITIVE_INFINITY;
    return clamp(time, 0, max);
  }

  _onSeeked() {
    clearTimeout(this._seekWatchdog);
    this._seekPending = false;
    this._drainSeek();
  }

  _onLoadedMetadata() {
    // Sans `data-vb-end`, la boucle va jusqu'a la fin du fichier. On ne le
    // sait qu'une fois la duree lue.
    if (this._openEnded && Number.isFinite(this.element.duration) && this.element.duration > 0) {
      this.segments.loop.end = this.element.duration;
      if (this._loop) this._loop.end = this.element.duration;
    }
    if (this._seekTarget !== null) this._drainSeek();
  }

  // --- Lecture en boucle sur un sous-segment ------------------------------

  playLoop(start, end, onCycle) {
    this._loop = { start, end };
    this._onCycle = onCycle;

    const time = this.element.currentTime;
    if (time < start || time >= end) this.hardSeek(start);

    this._play();
    this._startLoopWatch();
  }

  pause() {
    this._loop = null;
    this._onCycle = null;
    this._stopLoopWatch();
    if (!this.element.paused) this.element.pause();
  }

  async _play() {
    try {
      const started = this.element.play();
      if (started) await started;
    } catch (error) {
      // Autoplay refuse : le deblocage au premier geste utilisateur relancera.
    }
  }

  /**
   * requestAnimationFrame plutot que requestVideoFrameCallback : rVFC ne se
   * declenche que si des images sont presentees, donc il meurt si la lecture
   * est bloquee, et Firefox ne l'implemente pas.
   */
  _startLoopWatch() {
    this._stopLoopWatch();

    const tick = () => {
      if (!this._loop) return;
      if (this.element.currentTime >= this._loop.end - this._frameEpsilon) {
        if (!this._wrapLoop()) return;
      }
      this._loopHandle = requestAnimationFrame(tick);
    };

    this._loopHandle = requestAnimationFrame(tick);
  }

  _stopLoopWatch() {
    if (this._loopHandle === null) return;
    cancelAnimationFrame(this._loopHandle);
    this._loopHandle = null;
  }

  /**
   * Fin d'un tour : `onCycle` decide si on reboucle ou si on fige la
   * derniere image (auto-avance). Sans callback, comportement historique.
   */
  _wrapLoop() {
    const loop = this._loop;
    if (!loop) return false;
    if (this._onCycle?.() === false) {
      this.pause();
      return false;
    }
    this.hardSeek(loop.start);
    return true;
  }

  /** Filet de securite si la fin du fichier est atteinte avant le rebouclage. */
  _onEnded() {
    if (!this._loop) return;
    if (this._wrapLoop()) this._play();
  }

  // --- Affichage ----------------------------------------------------------

  show(fadeMs = 0) {
    const element = this.element;
    clearTimeout(this._visibilityTimer);
    this._visible = true;

    element.style.visibility = 'visible';
    element.style.transition = fadeMs > 0 ? `opacity ${fadeMs}ms linear` : 'none';
    if (fadeMs > 0) void element.offsetWidth; // fige la valeur de depart du fondu
    element.style.opacity = '1';
  }

  hide(fadeMs = 0) {
    const element = this.element;
    clearTimeout(this._visibilityTimer);
    this._visible = false;

    element.style.transition = fadeMs > 0 ? `opacity ${fadeMs}ms linear` : 'none';
    if (fadeMs > 0) void element.offsetWidth;
    element.style.opacity = '0';

    // `visibility: hidden` sort la couche de la composition une fois invisible.
    this._visibilityTimer = setTimeout(() => {
      if (!this._visible) element.style.visibility = 'hidden';
    }, fadeMs);
  }

  setDepth(depth) {
    this.element.style.zIndex = String(depth);
  }

  waitForFrame(timeoutMs = FRAME_WAIT_TIMEOUT_MS) {
    const video = this.element;
    if (typeof video.requestVideoFrameCallback !== 'function') {
      return wait(Math.min(timeoutMs, 80));
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };

      const timer = setTimeout(finish, timeoutMs);
      video.requestVideoFrameCallback(finish);
    });
  }

  destroy() {
    this.pause();
    clearTimeout(this._seekWatchdog);
    clearTimeout(this._visibilityTimer);
    this.element.removeEventListener('seeked', this._onSeeked);
    this.element.removeEventListener('loadedmetadata', this._onLoadedMetadata);
    this.element.removeEventListener('ended', this._onEnded);
  }
}
