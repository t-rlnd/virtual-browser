import test from 'node:test';
import assert from 'node:assert/strict';

import { Stage, MODES } from '../src/Stage.js';
import { VideoLayer } from '../src/layers/VideoLayer.js';
import { initCompact } from '../src/compact.js';
import { isCompactViewport } from '../src/env.js';

const CONFIG = { fadeMs: 10, jumpFadeMs: 10, defaultActive: 'v1' };
const SEGMENTS = {
  v1: { scrub: { start: 0, end: 3 }, loop: { start: 3, end: 6 } },
};

class FakeLayer extends VideoLayer {
  constructor(id) {
    super(id, SEGMENTS[id]);
    this.calls = [];
    this.time = 0;
    this.visible = false;
    this.looping = null;
  }

  preload() {
    return Promise.resolve(this);
  }

  seek(time) {
    this.time = time;
  }

  hardSeek(time) {
    this.calls.push(['hardSeek', time]);
    this.time = time;
  }

  playLoop(start, end) {
    this.calls.push(['playLoop', start, end]);
    this.looping = { start, end };
  }

  pause() {
    this.calls.push(['pause']);
    this.looping = null;
  }

  show() {
    this.visible = true;
  }

  hide() {
    this.visible = false;
  }

  setDepth() {}

  waitForFrame() {
    return Promise.resolve();
  }

  named(name) {
    return this.calls.filter(([call]) => call === name);
  }
}

class FakeObserver {
  static instances = [];

  constructor(callback) {
    this.callback = callback;
    this.target = null;
    this.disconnected = false;
    FakeObserver.instances.push(this);
  }

  observe(target) {
    this.target = target;
  }

  disconnect() {
    this.disconnected = true;
  }

  fire(isIntersecting) {
    this.callback([{ isIntersecting, target: this.target }]);
  }
}

function targetAt({ top, bottom }) {
  return {
    getBoundingClientRect: () => ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top }),
  };
}

function rootWith(loop) {
  return {
    querySelector(selector) {
      if (selector === '[data-vb-loop]') return loop;
      return null;
    },
  };
}

test.before(() => {
  FakeObserver.instances = [];
  globalThis.IntersectionObserver = FakeObserver;
  globalThis.window = Object.assign(globalThis.window ?? {}, { innerHeight: 800 });
});

test('isCompactViewport lit max-width', () => {
  const original = globalThis.window.matchMedia;
  globalThis.window.matchMedia = (query) => ({ matches: query === '(max-width: 991px)' });

  assert.equal(isCompactViewport(991), true);
  assert.equal(isCompactViewport(500), false);

  globalThis.window.matchMedia = original;
});

test('en compact, la progression est figee a 1 et le segment de boucle est lu', () => {
  const layer = new FakeLayer('v1');
  const stage = new Stage({ layers: { v1: layer }, config: CONFIG });
  const loop = targetAt({ top: 100, bottom: 400 });

  stage.mount();
  initCompact({ stage, root: rootWith(loop) });

  assert.equal(stage.progress, 1);
  assert.equal(stage.mode, MODES.LOOP);
  assert.deepEqual(layer.named('playLoop'), [['playLoop', 3, 6]]);
});

test('une section demo hors ecran met la video en pause', () => {
  const layer = new FakeLayer('v1');
  const stage = new Stage({ layers: { v1: layer }, config: CONFIG });
  const loop = targetAt({ top: 900, bottom: 1400 });

  stage.mount();
  initCompact({ stage, root: rootWith(loop) });

  assert.equal(stage.mode, MODES.IDLE);
  assert.equal(layer.looping, null);
});

test('revenir dans le champ relance la boucle, en sortir la coupe', () => {
  const layer = new FakeLayer('v1');
  const stage = new Stage({ layers: { v1: layer }, config: CONFIG });
  const loop = targetAt({ top: 900, bottom: 1400 });

  stage.mount();
  const compact = initCompact({ stage, root: rootWith(loop) });
  const observer = FakeObserver.instances.at(-1);

  observer.fire(true);
  assert.equal(stage.mode, MODES.LOOP);
  assert.deepEqual(layer.named('playLoop').at(-1), ['playLoop', 3, 6]);

  observer.fire(false);
  assert.equal(stage.mode, MODES.IDLE);
  assert.equal(layer.looping, null);

  compact.destroy();
  assert.equal(observer.disconnected, true);
});
