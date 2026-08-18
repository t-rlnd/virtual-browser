import test from 'node:test';
import assert from 'node:assert/strict';

import { describeVideo, collectVideos, resolveConfig, sourceFor } from '../src/config.js';

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

test('data-vb-transition convertit le numero d image en bornes scrub / boucle', () => {
  const video = describeVideo(
    el({
      'data-vb-video': 'v1',
      'data-vb-file': 'video1',
      'data-vb-transition': '166',
      'data-vb-end': '398',
    }),
    resolveConfig({ videos: {} })
  );

  assert.equal(video.id, 'v1');
  assert.equal(video.file, 'video1');
  assert.equal(video.transition, 166);
  assert.equal(video.end, 398);
  assert.equal(video.openEnded, false);
  assert.equal(video.declared, true);
  assert.equal(video.segments.scrub.end.toFixed(4), (166 / 30).toFixed(4));
  assert.equal(video.segments.loop.start, video.segments.scrub.end);
  assert.equal(video.segments.loop.end.toFixed(4), (398 / 30).toFixed(4));
});

test('sans data-vb-end, la boucle reste ouverte jusqu a la duree du fichier', () => {
  const video = describeVideo(
    el({
      'data-vb-video': 'v3',
      'data-vb-file': 'video3',
      'data-vb-transition': '140',
    }),
    resolveConfig({ videos: {} })
  );

  assert.equal(video.openEnded, true);
  assert.equal(video.segments.loop.start, 140 / 30);
  assert.equal(video.segments.loop.end, Number.POSITIVE_INFINITY);
});

test('une 3e video se declare uniquement par ses attributs', () => {
  const config = resolveConfig({ videos: {} });
  const videos = collectVideos(
    root([
      el({
        'data-vb-video': 'v1',
        'data-vb-file': 'video1',
        'data-vb-transition': '166',
        'data-vb-end': '398',
      }),
      el({
        'data-vb-video': 'v2',
        'data-vb-file': 'video2',
        'data-vb-transition': '116',
        'data-vb-end': '247',
      }),
      el({
        'data-vb-video': 'v3',
        'data-vb-file': 'video3',
        'data-vb-transition': '90',
        'data-vb-end': '200',
      }),
    ]),
    config
  );

  assert.deepEqual(
    videos.map((video) => video.id),
    ['v1', 'v2', 'v3']
  );
  assert.equal(videos[2].segments.scrub.end, 90 / 30);
  assert.equal(sourceFor(videos[2], 1280, config).endsWith('/video3-1280.mp4'), true);
});

test('les attributs l emportent sur la config', () => {
  const config = resolveConfig({
    videos: { v1: { file: 'video1', transition: 166, end: 398 } },
  });
  const video = describeVideo(
    el({
      'data-vb-video': 'v1',
      'data-vb-transition': '200',
      'data-vb-end': '400',
    }),
    config
  );

  assert.equal(video.transition, 200);
  assert.equal(video.end, 400);
  assert.equal(video.file, 'video1');
});
