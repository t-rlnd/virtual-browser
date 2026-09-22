import test from 'node:test';
import assert from 'node:assert/strict';

import { Stage, MODES } from '../src/Stage.js';
import { VideoLayer } from '../src/layers/VideoLayer.js';
import { wait } from '../src/utils.js';

const CONFIG = {
  fadeMs: 10,
  jumpFadeMs: 10,
  defaultActive: 'uc1',
  loopRepeats: 2,
};

// Decoupages volontairement differents : c'est le cas reel, l'intro de la
// video 1 etant plus longue que celle de la video 2.
const SEGMENTS = {
  uc1: { scrub: { start: 0, end: 3 }, loop: { start: 3, end: 6 } },
  uc2: { scrub: { start: 0, end: 2 }, loop: { start: 2, end: 5 } },
};

class FakeLayer extends VideoLayer {
  constructor(id) {
    super(id, SEGMENTS[id]);
    this.calls = [];
    this.time = 0;
    this.visible = false;
    this.depth = 0;
    this.looping = null;
    this.onCycle = null;
  }

  get currentTime() {
    return this.time;
  }

  preload() {
    this.calls.push(['preload']);
    return Promise.resolve(this);
  }

  seek(time) {
    this.calls.push(['seek', time]);
    this.time = time;
  }

  hardSeek(time) {
    this.calls.push(['hardSeek', time]);
    this.time = time;
  }

  playLoop(start, end, onCycle) {
    this.calls.push(['playLoop', start, end]);
    this.looping = { start, end };
    this.onCycle = onCycle;
  }

  pause() {
    this.calls.push(['pause']);
    this.looping = null;
    this.onCycle = null;
  }

  show() {
    this.visible = true;
  }

  hide() {
    this.visible = false;
  }

  setDepth(depth) {
    this.depth = depth;
  }

  waitForFrame() {
    return Promise.resolve();
  }

  named(name) {
    return this.calls.filter(([call]) => call === name);
  }

  /** Simule la fin d'un tour : delegue a `onCycle`, reboucle ou fige. */
  completeCycle() {
    const wrap = this.onCycle?.() !== false;
    if (!wrap) {
      this.pause();
      return false;
    }
    if (this.looping) this.hardSeek(this.looping.start);
    return true;
  }
}

function makeStage(overrides = {}) {
  const layers = { uc1: new FakeLayer('uc1'), uc2: new FakeLayer('uc2') };
  const stage = new Stage({ layers, config: { ...CONFIG, ...overrides } });
  return { stage, ...layers };
}

async function settle(stage) {
  await wait(stage.config.fadeMs + 5);
}

test('mount affiche la couche active et neutralise les autres', () => {
  const { stage, uc1, uc2 } = makeStage();
  stage.mount();

  assert.equal(uc1.visible, true);
  assert.equal(uc1.depth, 1);
  assert.equal(uc2.visible, false);
  assert.equal(uc2.depth, 0);
  assert.deepEqual(uc2.named('pause'), [['pause']]);
});

test('le scroll est mappe lineairement sur la plage scrubee', async () => {
  const { stage, uc1 } = makeStage();
  stage.mount();
  await stage.setMode(MODES.SCRUB);

  stage.setProgress(0);
  stage.setProgress(0.5);
  stage.setProgress(1);

  assert.deepEqual(
    uc1.named('seek').map(([, time]) => time),
    [0, 1.5, 3]
  );
});

test('le progres est memorise hors mode scrub mais n aucun effet immediat', async () => {
  const { stage, uc1 } = makeStage();
  stage.mount();
  await stage.setMode(MODES.LOOP);

  stage.setProgress(0.5);

  assert.equal(stage.progress, 0.5);
  assert.deepEqual(uc1.named('seek'), []);
});

test('entrer en boucle lance la lecture sur le sous-segment', async () => {
  const { stage, uc1 } = makeStage();
  stage.mount();
  await stage.setMode(MODES.LOOP);

  assert.deepEqual(uc1.named('playLoop'), [['playLoop', 3, 6]]);
  assert.equal(uc1.visible, true);
});

test('sortir du champ met toutes les couches en pause', async () => {
  const { stage, uc1, uc2 } = makeStage();
  stage.mount();
  await stage.setMode(MODES.LOOP);
  await stage.setMode(MODES.IDLE);

  assert.equal(uc1.looping, null);
  assert.ok(uc2.named('pause').length > 0);
});

test('le use-case entrant redemarre au debut de SA boucle', async () => {
  const { stage, uc1, uc2 } = makeStage();
  stage.mount();
  await stage.setMode(MODES.LOOP);

  await stage.setActive('uc2');

  // Les bornes de uc2, pas celles de uc1 ni des valeurs globales.
  assert.deepEqual(uc2.named('hardSeek'), [['hardSeek', 2]]);
  assert.deepEqual(uc2.named('playLoop'), [['playLoop', 2, 5]]);
  assert.equal(uc2.visible, true);
  assert.equal(uc2.depth, 1);

  // La couche sortante reste opaque pendant le fondu, puis se retire.
  assert.equal(uc1.visible, false);
  assert.equal(uc1.depth, 0);
  assert.equal(uc1.looping, null);
});

test('le choix de use-case est retroactif sur la section scrubee', async () => {
  const { stage, uc1, uc2 } = makeStage();
  stage.mount();
  await stage.setMode(MODES.LOOP);
  await stage.setActive('uc2');

  // L'utilisateur remonte vers la section 1. La meme progression de scroll
  // donne 0.5 s sur uc2 la ou elle donnerait 0.75 s sur uc1 : chaque video est
  // mappee sur sa propre plage, ce qui les garde perceptuellement synchrones.
  await stage.setMode(MODES.SCRUB);
  stage.setProgress(0.25);

  assert.equal(stage.activeId, 'uc2');
  assert.deepEqual(
    uc2.named('seek').map(([, time]) => time),
    [0.5]
  );
  assert.deepEqual(uc1.named('seek'), []);
  assert.equal(uc2.visible, true);
});

test('le retour boucle vers scrub cligne pour absorber le recul', async () => {
  const { stage, uc1 } = makeStage();
  stage.mount();
  await stage.setMode(MODES.LOOP);

  stage.progress = 1;
  const transition = stage.setMode(MODES.SCRUB);
  assert.equal(uc1.visible, false, 'la couche doit etre masquee pendant le saut');

  await transition;
  assert.equal(uc1.visible, true, 'et reaffichee une fois la bonne image prete');
  assert.deepEqual(uc1.named('hardSeek').at(-1), ['hardSeek', 3]);
});

test('jumpFadeMs a zero produit un cut sec', async () => {
  const { stage, uc1 } = makeStage({ jumpFadeMs: 0 });
  stage.mount();
  await stage.setMode(MODES.LOOP);

  await stage.setMode(MODES.SCRUB);

  assert.equal(uc1.visible, true);
});

test('une bascule vers un use-case inconnu est sans effet', async () => {
  const { stage } = makeStage();
  stage.mount();

  await stage.setActive('uc9');

  assert.equal(stage.activeId, 'uc1');
});

test('une bascule annulee en vol ne laisse pas la couche sortante allumee', async () => {
  const { stage, uc1, uc2 } = makeStage();
  stage.mount();
  await stage.setMode(MODES.LOOP);

  const first = stage.setActive('uc2');
  const second = stage.setActive('uc1');
  await Promise.all([first, second]);

  assert.equal(stage.activeId, 'uc1');
  assert.equal(uc1.visible, true);
  assert.equal(uc2.visible, false);
});

test('refresh remet chaque couche dans l etat de la machine', async () => {
  const { stage, uc1, uc2 } = makeStage();
  stage.mount();
  await stage.setMode(MODES.LOOP);

  // Le deblocage iOS lance brievement la lecture de toutes les couches :
  // refresh doit rendre la boucle a l active et le silence aux autres.
  uc2.looping = { start: 0, end: 1 };
  stage.refresh();

  assert.deepEqual(uc1.named('playLoop').at(-1), ['playLoop', 3, 6]);
  assert.equal(uc2.looping, null);
});

test('refresh en mode scrub repose la couche active sur son image', async () => {
  const { stage, uc1 } = makeStage();
  stage.mount();
  await stage.setMode(MODES.SCRUB);
  stage.setProgress(0.5);

  stage.refresh();

  assert.deepEqual(uc1.named('hardSeek').at(-1), ['hardSeek', 1.5]);
});

test('le premier tour de boucle laisse le use-case en place', async () => {
  const { stage, uc1 } = makeStage();
  stage.mount();
  await stage.setMode(MODES.LOOP);

  assert.equal(uc1.completeCycle(), true);
  assert.equal(stage.activeId, 'uc1');
  assert.ok(uc1.looping);
});

test('le deuxieme tour enchaine le use-case suivant', async () => {
  const { stage, uc1, uc2 } = makeStage();
  stage.mount();
  await stage.setMode(MODES.LOOP);

  uc1.completeCycle();
  assert.equal(uc1.completeCycle(), false);
  await settle(stage);

  assert.equal(stage.activeId, 'uc2');
  assert.deepEqual(uc2.named('playLoop').at(-1), ['playLoop', 2, 5]);
  assert.equal(uc1.looping, null);
});

test('le dernier use-case revient au premier', async () => {
  const { stage, uc1, uc2 } = makeStage();
  stage.mount();
  await stage.setMode(MODES.LOOP);

  uc1.completeCycle();
  uc1.completeCycle();
  await settle(stage);
  assert.equal(stage.activeId, 'uc2');

  uc2.completeCycle();
  uc2.completeCycle();
  await settle(stage);

  assert.equal(stage.activeId, 'uc1');
  assert.deepEqual(uc1.named('playLoop').at(-1), ['playLoop', 3, 6]);
});

test('un clic au milieu d un tour remet le compteur a zero', async () => {
  const { stage, uc1, uc2 } = makeStage();
  stage.mount();
  await stage.setMode(MODES.LOOP);

  uc1.completeCycle();
  await stage.setActive('uc2');

  assert.equal(uc2.completeCycle(), true);
  assert.equal(stage.activeId, 'uc2');

  assert.equal(uc2.completeCycle(), false);
  await settle(stage);
  assert.equal(stage.activeId, 'uc1');
});

test('loopRepeats infini ne bascule jamais tout seul', async () => {
  const { stage, uc1 } = makeStage({ loopRepeats: Infinity });
  stage.mount();
  await stage.setMode(MODES.LOOP);

  assert.equal(uc1.completeCycle(), true);
  assert.equal(uc1.completeCycle(), true);
  assert.equal(uc1.completeCycle(), true);
  await settle(stage);

  assert.equal(stage.activeId, 'uc1');
  assert.ok(uc1.looping);
});

test('une seule couche continue de boucler', async () => {
  const uc1 = new FakeLayer('uc1');
  const stage = new Stage({ layers: { uc1 }, config: { ...CONFIG } });
  stage.mount();
  await stage.setMode(MODES.LOOP);

  assert.equal(uc1.completeCycle(), true);
  assert.equal(uc1.completeCycle(), true);
  assert.equal(stage.activeId, 'uc1');
  assert.ok(uc1.looping);
});

test('refresh ne remet pas le compteur de boucle a zero', async () => {
  const { stage, uc1, uc2 } = makeStage();
  stage.mount();
  await stage.setMode(MODES.LOOP);

  uc1.completeCycle();
  stage.refresh();

  assert.equal(uc1.completeCycle(), false);
  await settle(stage);

  assert.equal(stage.activeId, 'uc2');
  assert.deepEqual(uc2.named('playLoop').at(-1), ['playLoop', 2, 5]);
});

test('loopProgress couvre les deux tours sans rembobiner', async () => {
  const { stage, uc1 } = makeStage();
  stage.mount();
  await stage.setMode(MODES.LOOP);

  uc1.time = 3;
  assert.equal(stage.loopProgress, 0);

  uc1.time = 4.5;
  assert.equal(stage.loopProgress, 0.25);

  uc1.time = 6;
  assert.equal(stage.loopProgress, 0.5);

  uc1.completeCycle();
  assert.equal(uc1.time, 3);
  assert.equal(stage.loopProgress, 0.5);

  uc1.time = 4.5;
  assert.equal(stage.loopProgress, 0.75);

  uc1.time = 6;
  assert.equal(stage.loopProgress, 1);
});

test('loopProgress rembobine a chaque tour si la boucle est infinie', async () => {
  const { stage, uc1 } = makeStage({ loopRepeats: Infinity });
  stage.mount();
  await stage.setMode(MODES.LOOP);

  uc1.time = 4.5;
  assert.equal(stage.loopProgress, 0.5);

  uc1.completeCycle();
  uc1.time = 4.5;
  assert.equal(stage.loopProgress, 0.5);
});
