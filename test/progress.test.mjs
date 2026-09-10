import test from 'node:test';
import assert from 'node:assert/strict';

import { initProgress, paintCurrent } from '../src/progress.js';

function htmlEl() {
  const attrs = {};
  const style = new Map();
  return {
    style: {
      setProperty(name, value) {
        style.set(name, value);
      },
      removeProperty(name) {
        style.delete(name);
      },
      getProperty(name) {
        return style.get(name);
      },
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    removeAttribute(name) {
      delete attrs[name];
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name);
    },
  };
}

function whenEl(ids) {
  const attrs = { 'data-vb-when': ids };
  return {
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    setAttribute(name, value) {
      attrs[name] = String(value);
    },
    removeAttribute(name) {
      delete attrs[name];
    },
  };
}

function rootWith(elements) {
  return {
    querySelectorAll(selector) {
      if (selector === '[data-vb-when]') return elements;
      return [];
    },
  };
}

function fakeStage({ activeId = 'v1', mode = 'idle', progress = 0 } = {}) {
  const listeners = new Map();
  return {
    activeId,
    mode,
    progress,
    on(event, callback) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(callback);
      return () => listeners.get(event)?.delete(callback);
    },
    emit(event, payload) {
      for (const callback of listeners.get(event) ?? []) callback(payload);
    },
  };
}

test('paintCurrent pose data-vb-current et data-vb-shown selon l id actif', () => {
  const element = htmlEl();
  const v1 = whenEl('v1');
  const v2 = whenEl('v2');
  const both = whenEl('v1, v2');

  paintCurrent('v1', { element, root: rootWith([v1, v2, both]) });

  assert.equal(element.getAttribute('data-vb-current'), 'v1');
  assert.equal(v1.getAttribute('data-vb-shown'), 'true');
  assert.equal(v2.getAttribute('data-vb-shown'), 'false');
  assert.equal(both.getAttribute('data-vb-shown'), 'true');

  paintCurrent('v2', { element, root: rootWith([v1, v2, both]) });

  assert.equal(element.getAttribute('data-vb-current'), 'v2');
  assert.equal(v1.getAttribute('data-vb-shown'), 'false');
  assert.equal(v2.getAttribute('data-vb-shown'), 'true');
  assert.equal(both.getAttribute('data-vb-shown'), 'true');
});

test('initProgress reflechit activechange sur html et sur [data-vb-when]', () => {
  const stage = fakeStage();
  const element = htmlEl();
  const v1 = whenEl('v1');
  const v2 = whenEl('v2');

  const progress = initProgress({
    stage,
    element,
    root: rootWith([v1, v2]),
  });

  assert.equal(element.getAttribute('data-vb-mode'), 'idle');
  assert.equal(element.getAttribute('data-vb-current'), 'v1');
  assert.equal(v1.getAttribute('data-vb-shown'), 'true');
  assert.equal(v2.getAttribute('data-vb-shown'), 'false');

  stage.activeId = 'v2';
  stage.emit('activechange', 'v2');

  assert.equal(element.getAttribute('data-vb-current'), 'v2');
  assert.equal(v1.getAttribute('data-vb-shown'), 'false');
  assert.equal(v2.getAttribute('data-vb-shown'), 'true');

  progress.destroy();
  assert.equal(element.getAttribute('data-vb-current'), null);
  assert.equal(element.getAttribute('data-vb-mode'), null);
  assert.equal(v1.getAttribute('data-vb-shown'), null);
  assert.equal(v2.getAttribute('data-vb-shown'), null);
});

test('[data-vb-when] sans valeur est ignore, avec un avertissement', () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));

  try {
    const empty = whenEl('');
    const v1 = whenEl('v1');
    paintCurrent('v1', { element: htmlEl(), root: rootWith([empty, v1]) });
    assert.equal(empty.getAttribute('data-vb-shown'), null);
    assert.equal(v1.getAttribute('data-vb-shown'), 'true');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /data-vb-when/);
  } finally {
    console.warn = original;
  }
});
