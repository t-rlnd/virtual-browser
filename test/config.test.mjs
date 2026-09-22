import test from 'node:test';
import assert from 'node:assert/strict';

import { describeVideo, collectVideos, resolveConfig, sourceFor } from '../src/config.js';

/** Faux element : `describeVideo` ne lit que des attributs. */
function el(attrs) {
  return {
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? String(attrs[name]) : null;
    },
  };
}

function root(elements) {
  return {
    querySelectorAll() {
      return elements;
    },
  };
}

test('data-vb-loop-at convertit le numero d image en bornes scrub / boucle', () => {
  const video = describeVideo(
    el({
      'data-vb-id': 'uc1',
      'data-vb-asset': 'video1',
      'data-vb-loop-at': '166',
      'data-vb-loop-end': '398',
    }),
    resolveConfig()
  );

  assert.equal(video.id, 'uc1');
  assert.equal(video.file, 'video1');
  assert.equal(video.transition, 166);
  assert.equal(video.end, 398);
  assert.equal(video.openEnded, false);
  assert.equal(video.declared, true);
  assert.equal(video.segments.scrub.end.toFixed(4), (166 / 30).toFixed(4));
  assert.equal(video.segments.loop.start, video.segments.scrub.end);
  assert.equal(video.segments.loop.end.toFixed(4), (398 / 30).toFixed(4));
});

test('sans data-vb-loop-end, la boucle reste ouverte jusqu a la duree du fichier', () => {
  const video = describeVideo(
    el({ 'data-vb-id': 'uc3', 'data-vb-asset': 'video3', 'data-vb-loop-at': '140' }),
    resolveConfig()
  );

  assert.equal(video.openEnded, true);
  assert.equal(video.segments.loop.start, 140 / 30);
  assert.equal(video.segments.loop.end, Number.POSITIVE_INFINITY);
});

test('sans data-vb-loop-at, le repli est signale et vaut fallbackScrubSeconds', () => {
  const config = resolveConfig({ fallbackScrubSeconds: 4 });
  const video = describeVideo(el({ 'data-vb-id': 'uc4' }), config);

  assert.equal(video.declared, false);
  assert.equal(video.transition, 120); // 4 s x 30 fps
  assert.equal(video.segments.scrub.end, 4);
  // Sans data-vb-asset, l identifiant sert de nom de fichier.
  assert.equal(video.file, 'uc4');
});

test('data-vb-fps l emporte sur la cadence globale', () => {
  const video = describeVideo(
    el({ 'data-vb-id': 'uc5', 'data-vb-loop-at': '120', 'data-vb-fps': '60' }),
    resolveConfig()
  );

  assert.equal(video.fps, 60);
  assert.equal(video.segments.scrub.end, 2);
});

test('une video se declare uniquement par ses attributs', () => {
  const config = resolveConfig();
  const videos = collectVideos(
    root([
      el({ 'data-vb-id': 'uc1', 'data-vb-asset': 'video1', 'data-vb-loop-at': '166', 'data-vb-loop-end': '398' }),
      el({ 'data-vb-id': 'uc2', 'data-vb-asset': 'video2', 'data-vb-loop-at': '116', 'data-vb-loop-end': '247' }),
      el({ 'data-vb-id': 'uc3', 'data-vb-asset': 'video3', 'data-vb-loop-at': '90', 'data-vb-loop-end': '200' }),
    ]),
    config
  );

  assert.deepEqual(
    videos.map((video) => video.id),
    ['uc1', 'uc2', 'uc3']
  );
  assert.equal(videos[2].segments.scrub.end, 90 / 30);
  assert.equal(sourceFor(videos[2], 1280, config).endsWith('/video3-1280.mp4'), true);
});

test('compactMaxWidth vaut 991 et se surcharge', () => {
  assert.equal(resolveConfig().compactMaxWidth, 991);
  assert.equal(resolveConfig({ compactMaxWidth: 768 }).compactMaxWidth, 768);
});
