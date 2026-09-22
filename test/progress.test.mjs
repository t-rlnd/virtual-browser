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

function visibleOnEl(ids) {
  const attrs = { 'data-vb-visible-on': ids };
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
      if (selector === '[data-vb-visible-on]') return elements;
      return [];
    },
  };
}

function fakeStage({ activeId = 'uc1', mode = 'idle', progress = 0 } = {}) {
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

test('paintCurrent pose data-vb-active-id et data-vb-visible selon l id actif', () => {
  const element = htmlEl();
  const uc1 = visibleOnEl('uc1');
  const uc2 = visibleOnEl('uc2');
  const both = visibleOnEl('uc1, uc2');

  paintCurrent('uc1', { element, root: rootWith([uc1, uc2, both]) });

  assert.equal(element.getAttribute('data-vb-active-id'), 'uc1');
  assert.equal(uc1.getAttribute('data-vb-visible'), 'true');
  assert.equal(uc2.getAttribute('data-vb-visible'), 'false');
  assert.equal(both.getAttribute('data-vb-visible'), 'true');

  paintCurrent('uc2', { element, root: rootWith([uc1, uc2, both]) });

  assert.equal(element.getAttribute('data-vb-active-id'), 'uc2');
  assert.equal(uc1.getAttribute('data-vb-visible'), 'false');
  assert.equal(uc2.getAttribute('data-vb-visible'), 'true');
  assert.equal(both.getAttribute('data-vb-visible'), 'true');
});

test('initProgress reflechit activechange sur html et sur [data-vb-visible-on]', () => {
  const stage = fakeStage();
  const element = htmlEl();
  const uc1 = visibleOnEl('uc1');
  const uc2 = visibleOnEl('uc2');

  const progress = initProgress({
    stage,
    element,
    root: rootWith([uc1, uc2]),
  });

  assert.equal(element.getAttribute('data-vb-mode'), 'idle');
  assert.equal(element.getAttribute('data-vb-active-id'), 'uc1');
  assert.equal(uc1.getAttribute('data-vb-visible'), 'true');
  assert.equal(uc2.getAttribute('data-vb-visible'), 'false');

  stage.activeId = 'uc2';
  stage.emit('activechange', 'uc2');

  assert.equal(element.getAttribute('data-vb-active-id'), 'uc2');
  assert.equal(uc1.getAttribute('data-vb-visible'), 'false');
  assert.equal(uc2.getAttribute('data-vb-visible'), 'true');

  progress.destroy();
  assert.equal(element.getAttribute('data-vb-active-id'), null);
  assert.equal(element.getAttribute('data-vb-mode'), null);
  assert.equal(uc1.getAttribute('data-vb-visible'), null);
  assert.equal(uc2.getAttribute('data-vb-visible'), null);
});

test('[data-vb-visible-on] sans valeur est ignore, avec un avertissement', () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));

  try {
    const empty = visibleOnEl('');
    const uc1 = visibleOnEl('uc1');
    paintCurrent('uc1', { element: htmlEl(), root: rootWith([empty, uc1]) });
    assert.equal(empty.getAttribute('data-vb-visible'), null);
    assert.equal(uc1.getAttribute('data-vb-visible'), 'true');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /data-vb-visible-on/);
  } finally {
    console.warn = original;
  }
});
