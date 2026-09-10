import { VideoLayer } from '../src/layers/VideoLayer.js';
import { clamp } from '../src/utils.js';

const PALETTE = {
  v1: { from: '#0b1f3a', to: '#2f7fd8', accent: '#7cc6ff' },
  v2: { from: '#3a0b23', to: '#d82f6b', accent: '#ff9ec2' },
};

/**
 * Couche de test rendue dans un <canvas>, sans aucun fichier video.
 *
 * Elle existe pour deux raisons : permettre de verifier le comportement du
 * scroll avant meme d'avoir encode les masters, et prouver que le contrat de
 * VideoLayer est reellement substituable — c'est exactement le chemin que
 * suivrait une implementation par sequence d'images.
 */
export class DebugLayer extends VideoLayer {
  constructor({ id, element, segments, duration }) {
    super(id, segments);

    this.element = element;
    this._context = element.getContext('2d');
    this._duration = duration;
    this._palette = PALETTE[id] ?? PALETTE.v1;

    this._time = 0;
    this._loop = null;
    this._onCycle = null;
    this._raf = null;
    this._visible = false;
    this._visibilityTimer = 0;

    this._onResize = () => {
      this._resize();
      this._draw();
    };
    window.addEventListener('resize', this._onResize);

    this._resize();
    this._draw();
  }

  get currentTime() {
    return this._time;
  }

  preload() {
    return Promise.resolve(this);
  }

  unlock() {
    return Promise.resolve(true);
  }

  seek(time) {
    this.hardSeek(time);
  }

  hardSeek(time) {
    this._time = clamp(time, 0, this._duration);
    this._draw();
  }

  playLoop(start, end, onCycle) {
    this._loop = { start, end };
    this._onCycle = onCycle;
    if (this._time < start || this._time >= end) this._time = start;

    this._stop();
    let previous = performance.now();

    const tick = (now) => {
      const delta = (now - previous) / 1000;
      previous = now;

      this._time += delta;
      if (this._time >= end) {
        if (this._onCycle?.() === false) {
          this._time = end;
          this.pause();
          this._draw();
          return;
        }
        this._time = start + ((this._time - start) % (end - start));
      }

      this._draw();
      this._raf = requestAnimationFrame(tick);
    };

    this._raf = requestAnimationFrame(tick);
  }

  pause() {
    this._loop = null;
    this._onCycle = null;
    this._stop();
  }

  _stop() {
    if (this._raf === null) return;
    cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  show(fadeMs = 0) {
    clearTimeout(this._visibilityTimer);
    this._visible = true;
    this.element.style.visibility = 'visible';
    this.element.style.transition = fadeMs > 0 ? `opacity ${fadeMs}ms linear` : 'none';
    if (fadeMs > 0) void this.element.offsetWidth;
    this.element.style.opacity = '1';
  }

  hide(fadeMs = 0) {
    clearTimeout(this._visibilityTimer);
    this._visible = false;
    this.element.style.transition = fadeMs > 0 ? `opacity ${fadeMs}ms linear` : 'none';
    if (fadeMs > 0) void this.element.offsetWidth;
    this.element.style.opacity = '0';
    this._visibilityTimer = setTimeout(() => {
      if (!this._visible) this.element.style.visibility = 'hidden';
    }, fadeMs);
  }

  setDepth(depth) {
    this.element.style.zIndex = String(depth);
  }

  waitForFrame() {
    return Promise.resolve();
  }

  destroy() {
    this._stop();
    clearTimeout(this._visibilityTimer);
    window.removeEventListener('resize', this._onResize);
  }

  _resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.element.width = window.innerWidth * ratio;
    this.element.height = window.innerHeight * ratio;
    this._context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  _draw() {
    const context = this._context;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const progress = this._time / this._duration;

    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, this._palette.from);
    gradient.addColorStop(1, this._palette.to);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    // Repere visuel du temps : sans mouvement continu, impossible de juger si
    // le scrub est fluide ou s'il saute.
    const angle = progress * Math.PI * 4;
    const radius = Math.min(width, height) * 0.22;
    context.strokeStyle = this._palette.accent;
    context.lineWidth = 6;
    context.beginPath();
    context.arc(width / 2, height / 2, radius, -Math.PI / 2, -Math.PI / 2 + angle);
    context.stroke();

    context.fillStyle = this._palette.accent;
    context.beginPath();
    context.arc(
      width / 2 + Math.sin(angle) * radius,
      height / 2 - Math.cos(angle) * radius,
      14,
      0,
      Math.PI * 2
    );
    context.fill();

    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.font = '600 64px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillText(this._time.toFixed(3).padStart(6, '0'), width / 2, height / 2 + 12);
    context.font = '500 20px ui-sans-serif, system-ui, sans-serif';
    context.fillText(this.id.toUpperCase(), width / 2, height / 2 + 48);
  }
}
