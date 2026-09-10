/**
 * Verification de bout en bout de la page de demonstration.
 *
 * Complementaire aux tests unitaires du Stage : ceux-ci valident la machine a
 * etats en isolation, celui-ci valide le cablage reel au scroll, que seul un
 * vrai moteur de rendu peut exercer.
 *
 * Prerequis : pnpm dev
 * Usage     : pnpm test:e2e  ·  BROWSER=webkit REAL=1 pnpm test:e2e
 */
import { chromium, firefox, webkit } from 'playwright';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** REAL=1 exerce les vraies balises <video> plutot que les canvas de test. */
const REAL = process.env.REAL === '1';
const URL = (process.env.DEMO_URL ?? 'http://localhost:3000/') + (REAL ? '?real' : '');

/**
 * BROWSER=webkit est le seul moyen local d'approcher Safari, ou se concentre
 * le risque du scrub : son decodeur peut se figer sur des seeks rapides la ou
 * Chromium ne bronche pas. Ce n'est pas Safari lui-meme, mais c'est le meme
 * moteur, et cela rattrape la majorite des regressions avant l'appareil reel.
 */
const ENGINES = { chromium, firefox, webkit };
const ENGINE = process.env.BROWSER ?? 'chromium';
const SHOTS = REAL ? '.artifacts/real' : '.artifacts';
const BROWSERS = ['.playwright', process.env.PLAYWRIGHT_BROWSERS_PATH].filter(Boolean);

/**
 * La detection d'architecture de Playwright se trompe dans certains
 * environnements et cherche un binaire x64 la ou l'arm64 a ete telecharge.
 * On resout donc le chemin nous-memes a partir de ce qui est reellement la.
 */
async function findHeadlessShell() {
  for (const root of BROWSERS) {
    let entries;
    try {
      entries = await readdir(root);
    } catch {
      continue;
    }

    for (const directory of entries) {
      if (!directory.startsWith('chromium_headless_shell')) continue;
      for (const platform of await readdir(join(root, directory))) {
        if (!platform.startsWith('chrome-headless-shell-')) continue;
        return join(root, directory, platform, 'chrome-headless-shell');
      }
    }
  }
  return undefined;
}

const results = [];
const consoleMessages = [];

function record(step, label, ok, detail) {
  results.push({ step, label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}. ${label}\n      ${detail}`);
}

const main = async () => {
  await mkdir(SHOTS, { recursive: true });

  const engine = ENGINES[ENGINE];
  if (!engine) {
    throw new Error(`BROWSER=${ENGINE} inconnu, attendu : ${Object.keys(ENGINES).join(', ')}`);
  }

  // Le contournement de resolution ne concerne que Chromium ; pour les autres
  // moteurs, playwright trouve seul son binaire sous PLAYWRIGHT_BROWSERS_PATH.
  const browser = await engine.launch(
    ENGINE === 'chromium' ? { executablePath: await findHeadlessShell() } : {}
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleMessages.push(`[${message.type()}] ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => consoleMessages.push(`[pageerror] ${error.message}`));

  // Surtout pas `networkidle` : une video en preload garde le reseau occupe,
  // et le client de live reload maintient une connexion ouverte en permanence.
  // Le vrai signal de disponibilite est celui que pose le script lui-meme.
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.documentElement.dataset.vbState === 'ready',
    undefined,
    { timeout: 60_000 }
  );

  const geometry = await page.evaluate(() => {
    const scrub = document.querySelector('[data-vb-scrub]');
    const config = window.scrollVideo.stage.config;
    const reserve = config.loopReserve ?? 0;
    const viewport = window.innerHeight;
    // La course d'epinglage, le conteneur colle consommant la derniere
    // hauteur d'ecran de la piste.
    const travel = scrub.offsetHeight - viewport;

    return {
      // Le scrub s'acheve une reserve avant la fin de la course : c'est la que
      // la boucle prend la main, section 2 encore sous les yeux.
      scrubEnd: scrub.offsetTop + travel - viewport * reserve,
      // Fin de l'epinglage : au-dela, le conteneur se decolle et le cadre se
      // remet a defiler avec la page.
      unpin: scrub.offsetTop + travel,
      dockRange: config.dockRange,
      reserve,
      viewport,
      pageBottom: document.body.scrollHeight - viewport,
    };
  });

  /** Le recadrage etant pilote par le scroll, il se predit depuis la progression. */
  const dockFor = (progress) => {
    const { start, end } = geometry.dockRange;
    return Math.min(1, Math.max(0, (progress - start) / (end - start)));
  };

  /**
   * Lit l'etat interne, mais aussi ce qui est reellement peint : c'est la
   * seule facon de distinguer « le Stage croit afficher v2 » de « v2 est
   * effectivement a l'ecran ».
   */
  const read = (target = page) =>
    target.evaluate(() => {
      const stage = window.scrollVideo.stage;
      const element = stage.active.element;

      const visible = [...document.querySelectorAll('[data-vb-video]')].find(
        (candidate) => getComputedStyle(candidate).opacity === '1'
      );

      // Signature de l'image affichee, pour verifier qu'une image est bien
      // rendue et qu'elle change quand la video change.
      let luminance = null;
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 18;
      const context = canvas.getContext('2d', { willReadFrequently: true });

      try {
        context.drawImage(element, 0, 0, 32, 18);
        const { data } = context.getImageData(0, 0, 32, 18);
        let total = 0;
        for (let index = 0; index < data.length; index += 4) {
          total += data[index] + data[index + 1] + data[index + 2];
        }
        luminance = Math.round(total / (data.length / 4) / 3);
      } catch {
        luminance = null;
      }

      const stageElement = document.querySelector('[data-vb-stage]');
      const frameElement = document.querySelector('[data-vb-frame]');
      const box = (node) => {
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return [rect.x, rect.y, rect.width, rect.height].map(Math.round);
      };

      return {
        mode: stage.mode,
        active: stage.activeId,
        // Geometrie reelle de la couche : c'est elle qui dit si le fond est
        // plein ecran ou cale dans son cadre.
        videoBox: box(element),
        frameBox: box(frameElement),
        stageBox: box(stageElement),
        dock: Number(getComputedStyle(stageElement).getPropertyValue('--vb-dock')) || 0,
        progress: Number(stage.progress.toFixed(3)),
        time: Number((stage.active.currentTime ?? 0).toFixed(3)),
        opacity: getComputedStyle(element).opacity,
        visibleId: visible ? visible.dataset.vbVideo : null,
        luminance,
        current: document.documentElement.getAttribute('data-vb-current'),
        when: [...document.querySelectorAll('[data-vb-when]')].map((node) => ({
          ids: (node.getAttribute('data-vb-when') ?? '')
            .trim()
            .split(/[\s,]+/)
            .filter(Boolean),
          shown: node.getAttribute('data-vb-shown'),
        })),
        // Chaque video a son propre decoupage : les attentes se calculent
        // depuis les bornes de la couche active, jamais en dur.
        segments: stage.active.segments,
      };
    });

  /** Le Stage designe la bonne couche, et c'est bien elle qui est a l'ecran. */
  const shows = (state, id) =>
    state.active === id && state.visibleId === id && state.opacity === '1' && state.luminance > 0;

  /** Les calques `[data-vb-when]` suivent le use-case actif. */
  const whenMatches = (state, id) =>
    state.current === id &&
    state.when.length > 0 &&
    state.when.every((entry) => entry.shown === String(entry.ids.includes(id)));

  const scrollTo = async (y, settle = 900, target = page) => {
    await target.evaluate((top) => window.scrollTo(0, top), y);
    await target.waitForTimeout(settle);
  };

  /** Geometrie de la piste, a relire apres le collapse (la 300vh initiale est perimee). */
  const readTrack = (target = page) =>
    target.evaluate(() => {
      const scrub = document.querySelector('[data-vb-scrub]');
      const loop = document.querySelector('[data-vb-loop]');
      const viewport = window.innerHeight;
      const top = scrub.offsetTop;
      const height = scrub.offsetHeight;
      return {
        latched: document.documentElement.getAttribute('data-vb-latched') === 'true',
        height,
        top,
        viewport,
        loopTop: loop.getBoundingClientRect().top,
        unpin: top + Math.max(0, height - viewport),
        pageBottom: Math.max(0, document.body.scrollHeight - viewport),
      };
    });

  /** Le timecode correspond-il a la progression, sur la plage de CETTE video ? */
  const scrubbedTo = (state, expected) => {
    const { start, end } = state.segments.scrub;
    return Math.abs(state.time - (start + (end - start) * expected)) < 0.15;
  };

  const inLoop = (state) =>
    state.time >= state.segments.loop.start - 0.15 && state.time <= state.segments.loop.end + 0.15;

  /** Deux boites au meme endroit, a l'arrondi et au sous-pixel pres. */
  const near = (a, b, tolerance = 2) =>
    Array.isArray(a) && Array.isArray(b) && a.every((value, index) => Math.abs(value - b[index]) <= tolerance);

  const boxes = (state) =>
    `video=[${state.videoBox}] cadre=[${state.frameBox}] stage=[${state.stageBox}]`;

  const shot = (name, target = page) => target.screenshot({ path: `${SHOTS}/${name}.png` });
  const show = (state) =>
    `mode=${state.mode} active=${state.active} affiche=${state.visibleId} current=${state.current} progress=${state.progress} currentTime=${state.time} luminance=${state.luminance}`;

  // 1 — etat initial
  await scrollTo(0);
  let state = await read();
  await shot('01-top');
  record(1, 'Etat initial en haut de page', state.mode === 'scrub' && shows(state, 'v1') && state.time < 0.1 && whenMatches(state, 'v1'), show(state));

  // 2 — scrub vers l'avant
  await scrollTo(geometry.scrubEnd / 2);
  const middle = await read();
  await shot('02-scrub-milieu');
  record(2, 'Le scroll fait avancer le timecode', middle.time > 0.5 && scrubbedTo(middle, middle.progress), show(middle));

  // 3 — scrub inverse
  await scrollTo(0);
  state = await read();
  await shot('03-retour-haut');
  record(3, 'Remonter rembobine', state.time < 0.1, show(state));

  // 4 — la section 2 arrive mais n'occupe pas encore sa part d'ecran
  await scrollTo(geometry.scrubEnd - geometry.viewport / 4);
  const halfway = await read();
  await shot('04-section2-a-moitie');
  record(
    4,
    'Le scrub continue tant que la reserve de boucle n est pas atteinte',
    halfway.mode === 'scrub' && halfway.progress > 0.4 && halfway.progress < 1,
    show(halfway)
  );

  // 5 — boucle autonome, des que la section 2 occupe sa part d'ecran
  await scrollTo(geometry.scrubEnd);
  const first = await read();
  await page.waitForTimeout(1000);
  const second = await read();
  await shot('05-boucle');
  record(
    5,
    'L entree dans la reserve declenche la boucle',
    first.mode === 'loop' && second.time !== first.time && inLoop(first) && inLoop(second),
    `${show(first)} puis currentTime=${second.time}`
  );

  // 24 — le verrou replie la piste : plus de scroll mort au-dessus ni de reserve en dessous
  await page.waitForFunction(
    () => document.documentElement.getAttribute('data-vb-latched') === 'true',
    undefined,
    { timeout: 2_000 }
  );
  const latchedTrack = await readTrack();
  await shot('24-piste-collapsee');
  record(
    24,
    'Une fois la boucle atteinte, la piste se replie a 100dvh sous les yeux',
    latchedTrack.latched &&
      Math.abs(latchedTrack.height - latchedTrack.viewport) <= 2 &&
      Math.abs(latchedTrack.loopTop) <= 2,
    `latched=${latchedTrack.latched} height=${latchedTrack.height} viewport=${latchedTrack.viewport} loopTop=${latchedTrack.loopTop}`
  );

  // 6 — bascule de use-case
  await page.click('[data-vb-usecase="v2"]');
  await page.waitForTimeout(700);
  state = await read();
  await shot('06-usecase-2');
  record(6, 'Le use-case 2 remplace la video de fond', shows(state, 'v2') && inLoop(state) && whenMatches(state, 'v2'), show(state));

  // 7 — le verrou : remonter ne rend plus la main au scrub
  await scrollTo(latchedTrack.top);
  state = await read();
  await shot('07-verrou-remontee');
  record(
    7,
    'Remonter ne relance pas le scrub une fois la boucle atteinte',
    state.mode !== 'scrub' && shows(state, 'v2') && near(state.videoBox, state.frameBox),
    `${show(state)} ${boxes(state)}`
  );

  // 8 — la piste restant a l'ecran, la video continue de boucler dans sa zone
  await scrollTo(latchedTrack.top);
  const locked = await read();
  await page.waitForTimeout(700);
  const lockedAgain = await read();
  await shot('08-haut-verrouille');
  record(
    8,
    'Remonter en haut de piste laisse la video calee et bouclee, sans rembobiner',
    locked.mode === 'loop' &&
      inLoop(locked) &&
      lockedAgain.time !== locked.time &&
      locked.dock === 1,
    `${show(locked)} dock=${locked.dock}`
  );

  // 9 — mise en pause hors ecran
  await scrollTo(latchedTrack.pageBottom);
  const idleFirst = await read();
  await page.waitForTimeout(1000);
  const idleSecond = await read();
  await shot('09-hors-ecran');
  record(9, 'La video est figee quand la section 2 sort de l ecran', idleFirst.mode === 'idle' && idleFirst.time === idleSecond.time, `${show(idleFirst)} puis currentTime=${idleSecond.time}`);

  // 10 — reprise
  await scrollTo(latchedTrack.top);
  const resumeFirst = await read();
  await page.waitForTimeout(1000);
  const resumeSecond = await read();
  await shot('10-reprise');
  record(10, 'La boucle repart quand la section 2 revient', resumeFirst.mode === 'loop' && resumeSecond.time !== resumeFirst.time, `${show(resumeFirst)} puis currentTime=${resumeSecond.time}`);

  // 11 — retour au use-case 1
  await page.click('[data-vb-usecase="v1"]');
  await page.waitForTimeout(700);
  state = await read();
  await shot('11-usecase-1');
  record(11, 'Le use-case 1 restaure la video 1', shows(state, 'v1') && whenMatches(state, 'v1'), show(state));

  const completeLoopCycle = async () => {
    const previousId = await page.evaluate(() => window.scrollVideo.stage.activeId);
    await page.evaluate(() => {
      const layer = window.scrollVideo.stage.active;
      layer.hardSeek(layer.segments.loop.end - 0.0001);
    });
    await page.waitForFunction(
      (prevId) => {
        const stage = window.scrollVideo.stage;
        const layer = stage.active;
        if (stage.activeId !== prevId) return true;
        return layer.currentTime < layer.segments.loop.start + 0.5;
      },
      previousId,
      { timeout: 4_000 }
    );
  };

  // 18 — auto-avance : deux tours du segment boucle enchainent le use-case suivant
  await completeLoopCycle();
  const afterOneCycle = await read();
  const afterOneBar = await page.evaluate(() => {
    const bar = document.querySelector('[data-vb-usecase="v1"] [data-vb-progress]');
    return {
      loopProgress: window.scrollVideo.stage.loopProgress,
      width: bar ? parseFloat(bar.style.width) : null,
    };
  });
  await completeLoopCycle();
  await page.waitForTimeout(400);
  const afterTwoCycles = await read();
  await shot('23-auto-avance');
  record(
    23,
    'Deux tours de boucle enchainent le use-case suivant',
    afterOneCycle.active === 'v1' &&
      afterOneBar.loopProgress > 0.45 &&
      afterOneBar.loopProgress < 0.55 &&
      afterOneBar.width > 45 &&
      afterOneBar.width < 55 &&
      shows(afterTwoCycles, 'v2') &&
      whenMatches(afterTwoCycles, 'v2'),
    `apres 1 tour ${show(afterOneCycle)} barre=${afterOneBar.width}% p=${afterOneBar.loopProgress} ; apres 2 tours ${show(afterTwoCycles)}`
  );

  // 13 — le fond vient se caler sur [data-vb-frame] pendant la boucle
  await scrollTo(latchedTrack.top, 1600);
  const docked = await read();
  await shot('13-cale-sur-le-cadre');
  record(
    13,
    'La boucle cale le fond sur le cadre de la section 2',
    docked.frameBox != null && near(docked.videoBox, docked.frameBox) && docked.dock > 0.99,
    `${boxes(docked)} dock=${docked.dock}`
  );

  // 14 — et il suit ce cadre une fois l'epinglage relache, quand il se remet a defiler
  await scrollTo(latchedTrack.unpin + 100, 400);
  const followed = await read();
  await shot('14-le-cadre-defile');
  record(
    14,
    'Le fond suit le cadre pendant que la section defile',
    followed.frameBox != null && near(followed.videoBox, followed.frameBox),
    boxes(followed)
  );

  /**
   * Verrou relache — l'autre moitie du contrat. Le rechargement est le seul
   * moyen d'exercer `latchLoop: false`, la valeur etant lue au cablage.
   */
  await page.addInitScript(() => {
    window.SCROLL_VIDEO_CONFIG = { ...(window.SCROLL_VIDEO_CONFIG ?? {}), latchLoop: false };
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.documentElement.dataset.vbState === 'ready',
    undefined,
    { timeout: 60_000 }
  );

  // 15 — sans verrou, remonter rend la main au scrub et defait le recadrage
  //      a la position exacte du scroll, pas en un temps fixe
  const unlockedTrack = await readTrack();
  await scrollTo(geometry.scrubEnd, 1600);
  await page.click('[data-vb-usecase="v2"]');
  await page.waitForTimeout(700);
  await scrollTo(geometry.scrubEnd / 2, 1600);
  const undocked = await read();
  const expected = dockFor(undocked.progress);
  await shot('15-verrou-relache');
  record(
    15,
    'latchLoop:false rend la main au scrub, et le recadrage suit le scroll',
    !unlockedTrack.latched &&
      unlockedTrack.height > unlockedTrack.viewport * 2 &&
      undocked.mode === 'scrub' &&
      Math.abs(undocked.dock - expected) < 0.05,
    `latched=${unlockedTrack.latched} height=${unlockedTrack.height} ${show(undocked)} dock=${undocked.dock} attendu=${expected.toFixed(3)}`
  );

  // 16 — avant le debut de la plage de recadrage, le fond est rendu plein ecran
  await scrollTo(0);
  const rewound = await read();
  await shot('16-retroactivite');
  record(
    16,
    'Sans verrou, le fond redevient plein ecran et le use-case reste retroactif',
    rewound.mode === 'scrub' &&
      shows(rewound, 'v2') &&
      rewound.time < 0.1 &&
      rewound.dock === 0 &&
      near(rewound.videoBox, rewound.stageBox),
    `${show(rewound)} ${boxes(rewound)} dock=${rewound.dock}`
  );

  /**
   * 17 — la mise en scene accrochee a `--vb-scrub`. C'est la contrepartie CSS
   * du montage superpose : le JS ne fait plus qu'ecrire un nombre, et c'est la
   * page qui en tire l'apparition et la disparition de ses calques. Verifier
   * la variable ne suffit donc pas, il faut lire ce qu'elle produit a l'ecran.
   *
   * Les attentes se calculent depuis la progression reellement atteinte, et
   * non depuis la position visee : le lissage du scrub laisse un retard, qui
   * n'est pas une erreur.
   */
  const clamp = (value) => Math.min(1, Math.max(0, value));
  const staging = [];

  for (const fraction of [0, 0.15, 0.35, 0.5, 0.7, 0.9]) {
    await scrollTo(geometry.scrubEnd * fraction, 1200);
    const sample = await page.evaluate(() => {
      const opacity = (selector) => {
        const node = document.querySelector(selector);
        return node ? Number(getComputedStyle(node).opacity) : null;
      };
      return {
        variable: Number(
          getComputedStyle(document.documentElement).getPropertyValue('--vb-scrub')
        ),
        progress: window.scrollVideo.stage.progress,
        intro: opacity('.intro'),
        demo: opacity('[data-vb-loop]'),
        pins: opacity('.pins'),
      };
    });

    const p = sample.progress;
    const expected = {
      intro: clamp(1 - p / 0.2),
      demo: clamp((p - 0.3) / 0.3),
      pins: clamp((p - 0.8) / 0.2),
    };

    const ok =
      Math.abs(sample.variable - p) < 0.002 &&
      ['intro', 'demo', 'pins'].every((key) => Math.abs(sample[key] - expected[key]) < 0.02);

    staging.push({
      ok,
      detail:
        `p=${p.toFixed(3)} intro=${sample.intro.toFixed(2)}/${expected.intro.toFixed(2)} ` +
        `demo=${sample.demo.toFixed(2)}/${expected.demo.toFixed(2)} ` +
        `pins=${sample.pins.toFixed(2)}/${expected.pins.toFixed(2)}`,
    });
  }

  await shot('17-mise-en-scene');
  record(
    17,
    'Les calques suivent --vb-scrub aux seuils poses par la page',
    staging.every((entry) => entry.ok),
    staging.map((entry) => `${entry.ok ? 'ok' : 'KO'} ${entry.detail}`).join('\n      ')
  );

  // 12 — cout reel d'un seek, le chiffre qui decide entre <video> et canvas
  await scrollTo(0);
  const latency = await page.evaluate(async () => {
    const layer = window.scrollVideo.stage.active;
    const element = layer.element;
    if (!('seeking' in element)) return null;

    const durations = [];
    for (let step = 1; step <= 30; step += 1) {
      const start = performance.now();
      await new Promise((resolve) => {
        element.addEventListener('seeked', resolve, { once: true });
        element.currentTime = (step / 30) * 3;
      });
      durations.push(performance.now() - start);
    }

    durations.sort((a, b) => a - b);
    return {
      median: Math.round(durations[Math.floor(durations.length / 2)]),
      worst: Math.round(durations.at(-1)),
    };
  });

  if (latency) {
    record(
      12,
      'Le cout d un seek reste compatible avec un scrub fluide',
      latency.median < 33,
      `mediane ${latency.median} ms, pire cas ${latency.worst} ms (budget : 33 ms par image a 30 fps)`
    );
  }

  /**
   * Mode compact — tablette et mobile. Un second viewport, independant du
   * parcours desktop (y compris du rechargement `latchLoop: false`).
   */
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleMessages.push(`[compact ${message.type()}] ${message.text()}`);
    }
  });
  mobile.on('pageerror', (error) =>
    consoleMessages.push(`[compact pageerror] ${error.message}`)
  );

  await mobile.goto(URL, { waitUntil: 'domcontentloaded' });
  await mobile.waitForFunction(
    () => document.documentElement.dataset.vbState === 'ready',
    undefined,
    { timeout: 60_000 }
  );

  const compactGeo = await mobile.evaluate(() => {
    const loop = document.querySelector('[data-vb-loop]');
    const intro = document.querySelector('.intro');
    const after = document.querySelector('.after');
    return {
      flagged: document.documentElement.getAttribute('data-vb-compact') === 'true',
      latched: document.documentElement.getAttribute('data-vb-latched') === 'true',
      introOpacity: Number(getComputedStyle(intro).opacity),
      demoOpacity: Number(getComputedStyle(loop).opacity),
      introPosition: getComputedStyle(intro).position,
      demoPosition: getComputedStyle(loop).position,
      loopTop: loop.getBoundingClientRect().top + window.scrollY,
      pageBottom: Math.max(0, document.body.scrollHeight - window.innerHeight),
      afterTop: after.getBoundingClientRect().top + window.scrollY,
    };
  });

  await scrollTo(0, 400, mobile);
  const compactTop = await read(mobile);
  await shot('c01-top', mobile);
  record(
    18,
    'Sous 991 px le layout compact est actif, intro et demo visibles',
    compactGeo.flagged &&
      !compactGeo.latched &&
      compactGeo.introOpacity === 1 &&
      compactGeo.demoOpacity === 1 &&
      compactGeo.introPosition === 'relative' &&
      compactGeo.demoPosition === 'relative' &&
      compactTop.progress === 1,
    `compact=${compactGeo.flagged} latched=${compactGeo.latched} intro=${compactGeo.introOpacity}/${compactGeo.introPosition} demo=${compactGeo.demoOpacity}/${compactGeo.demoPosition} ${show(compactTop)}`
  );

  await scrollTo(compactGeo.loopTop, 900, mobile);
  const compactLoop = await read(mobile);
  await mobile.waitForTimeout(700);
  const compactLoopAgain = await read(mobile);
  await shot('c02-boucle', mobile);
  record(
    19,
    'La video boucle dans son cadre, sans scrub, sur le segment de boucle',
    compactLoop.mode === 'loop' &&
      compactLoop.progress === 1 &&
      compactLoop.dock === 1 &&
      near(compactLoop.videoBox, compactLoop.frameBox) &&
      inLoop(compactLoop) &&
      compactLoopAgain.time !== compactLoop.time,
    `${show(compactLoop)} ${boxes(compactLoop)} dock=${compactLoop.dock} puis currentTime=${compactLoopAgain.time}`
  );

  await mobile.click('[data-vb-usecase="v2"]');
  await mobile.waitForTimeout(700);
  const compactSwitch = await read(mobile);
  await shot('c03-usecase-2', mobile);
  record(
    20,
    'Les use-cases restent cliquables en compact',
    shows(compactSwitch, 'v2') && inLoop(compactSwitch) && whenMatches(compactSwitch, 'v2'),
    show(compactSwitch)
  );

  await scrollTo(compactGeo.pageBottom, 900, mobile);
  const compactIdle = await read(mobile);
  await mobile.waitForTimeout(800);
  const compactIdleAgain = await read(mobile);
  await shot('c04-hors-ecran', mobile);
  record(
    21,
    'Hors ecran, la boucle compacte se coupe',
    compactIdle.mode === 'idle' && compactIdle.time === compactIdleAgain.time,
    `${show(compactIdle)} puis currentTime=${compactIdleAgain.time}`
  );

  await scrollTo(compactGeo.loopTop, 900, mobile);
  const compactResume = await read(mobile);
  await mobile.waitForTimeout(700);
  const compactResumeAgain = await read(mobile);
  await shot('c05-reprise', mobile);
  record(
    22,
    'Revenir sur la section demo relance la boucle',
    compactResume.mode === 'loop' && compactResumeAgain.time !== compactResume.time,
    `${show(compactResume)} puis currentTime=${compactResumeAgain.time}`
  );

  await mobile.close();

  await browser.close();

  console.log('\nConsole du navigateur :');
  console.log(consoleMessages.length ? consoleMessages.join('\n') : '  (aucune erreur ni avertissement)');

  const failures = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failures.length}/${results.length} etapes validees` +
      `  (${ENGINE}${REAL ? ', MP4 reels' : ''})`
  );
  process.exit(failures.length === 0 ? 0 : 1);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
