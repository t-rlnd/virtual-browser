import test from 'node:test';
import assert from 'node:assert/strict';

import { stepForProgress, collectSteps } from '../src/hero.js';
import { describeHero, resolveConfig } from '../src/config.js';

const el = (attrs = {}) => ({
  getAttribute: (name) => (name in attrs ? attrs[name] : null),
});

test('les bascules tombent a 1/3 et 2/3 de la progression', () => {
  assert.equal(stepForProgress(0), 0);
  assert.equal(stepForProgress(0.333), 0);
  assert.equal(stepForProgress(1 / 3), 1);
  assert.equal(stepForProgress(0.5), 1);
  assert.equal(stepForProgress(0.666), 1);
  assert.equal(stepForProgress(2 / 3), 2);
  assert.equal(stepForProgress(1), 2);
});

test('une progression hors bornes reste sur la premiere ou la derniere etape', () => {
  assert.equal(stepForProgress(-0.2), 0);
  assert.equal(stepForProgress(1.4), 2);
});

test('le nombre d etapes se regle', () => {
  assert.equal(stepForProgress(0.3, 4), 1);
  assert.equal(stepForProgress(0.99, 4), 3);
});

test('les blocs de texte sont ranges par leur numero, pas par l ordre du DOM', () => {
  const steps = [2, 0, 1].map((n) => el({ 'data-vb-hero-step': String(n) }));
  const root = { querySelectorAll: () => steps };
  assert.deepEqual(
    collectSteps(root).map((step) => step.getAttribute('data-vb-hero-step')),
    ['0', '1', '2']
  );
});

test('describeHero : fichier hero par defaut, fin laissee a la duree du fichier', () => {
  const hero = describeHero(el(), resolveConfig());
  assert.equal(hero.file, 'hero');
  assert.equal(hero.declared, false);
  assert.equal(hero.segments.scrub.end, null);
});

test('describeHero : data-vb-hero-end convertit le numero d image en secondes', () => {
  const hero = describeHero(el({ 'data-vb-asset': 'hero-v2', 'data-vb-hero-end': '300' }), resolveConfig());
  assert.equal(hero.file, 'hero-v2');
  assert.equal(hero.declared, true);
  assert.equal(hero.segments.scrub.end, 10);
});

test('la config du Heros se surcharge sans perdre les valeurs par defaut', () => {
  const config = resolveConfig({ hero: { staggerMs: 120 } });
  assert.deepEqual(config.hero, { steps: 3, staggerMs: 120 });
});
