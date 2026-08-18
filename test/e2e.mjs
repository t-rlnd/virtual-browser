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
    const loop = document.querySelector('[data-vb-loop]');
    return {
      // Le scrub se termine quand la section 2 occupe tout l'ecran.
      scrubEnd: loop.offsetTop,
      loopTop: loop.offsetTop,
      viewport: window.innerHeight,
      pageBottom: document.body.scrollHeight - window.innerHeight,
    };
  });

  /**
   * Lit l'etat interne, mais aussi ce qui est reellement peint : c'est la
   * seule facon de distinguer « le Stage croit afficher v2 » de « v2 est
   * effectivement a l'ecran ».
   */
  const read = async () =>
    page.evaluate(() => {
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

      return {
        mode: stage.mode,
        active: stage.activeId,
        progress: Number(stage.progress.toFixed(3)),
        time: Number((stage.active.currentTime ?? 0).toFixed(3)),
        opacity: getComputedStyle(element).opacity,
        visibleId: visible ? visible.dataset.vbVideo : null,
        luminance,
        // Chaque video a son propre decoupage : les attentes se calculent
        // depuis les bornes de la couche active, jamais en dur.
        segments: stage.active.segments,
      };
    });

  /** Le Stage designe la bonne couche, et c'est bien elle qui est a l'ecran. */
  const shows = (state, id) =>
    state.active === id && state.visibleId === id && state.opacity === '1' && state.luminance > 0;

  const scrollTo = async (y, settle = 900) => {
    await page.evaluate((target) => window.scrollTo(0, target), y);
    await page.waitForTimeout(settle);
  };

  /** Le timecode correspond-il a la progression, sur la plage de CETTE video ? */
  const scrubbedTo = (state, expected) => {
    const { start, end } = state.segments.scrub;
    return Math.abs(state.time - (start + (end - start) * expected)) < 0.15;
  };

  const inLoop = (state) =>
    state.time >= state.segments.loop.start - 0.15 && state.time <= state.segments.loop.end + 0.15;

  const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
  const show = (state) =>
    `mode=${state.mode} active=${state.active} affiche=${state.visibleId} progress=${state.progress} currentTime=${state.time} luminance=${state.luminance}`;

  // 1 — etat initial
  await scrollTo(0);
  let state = await read();
  await shot('01-top');
  record(1, 'Etat initial en haut de page', state.mode === 'scrub' && shows(state, 'v1') && state.time < 0.1, show(state));

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

  // 4 — la section 2 arrive mais n'occupe pas encore tout l'ecran
  await scrollTo(geometry.loopTop - geometry.viewport / 2);
  const halfway = await read();
  await shot('04-section2-a-moitie');
  record(
    4,
    'Le scrub continue tant que la section 2 ne remplit pas l ecran',
    halfway.mode === 'scrub' && halfway.progress > 0.4 && halfway.progress < 1,
    show(halfway)
  );

  // 5 — boucle autonome, des que la section 2 occupe tout l'ecran
  await scrollTo(geometry.loopTop);
  const first = await read();
  await page.waitForTimeout(1000);
  const second = await read();
  await shot('05-boucle');
  record(
    5,
    'La section 2 pleine page declenche la boucle',
    first.mode === 'loop' && second.time !== first.time && inLoop(first) && inLoop(second),
    `${show(first)} puis currentTime=${second.time}`
  );

  // 6 — bascule de use-case
  await page.click('[data-vb-usecase="v2"]');
  await page.waitForTimeout(700);
  state = await read();
  await shot('06-usecase-2');
  record(6, 'Le use-case 2 remplace la video de fond', shows(state, 'v2') && inLoop(state), show(state));

  // 7 — retroactivite, le point central de la specification
  await scrollTo(geometry.scrubEnd / 2);
  state = await read();
  await shot('07-retroactivite');
  record(
    7,
    'Le choix de use-case est retroactif sur la section 1',
    state.mode === 'scrub' && shows(state, 'v2') && scrubbedTo(state, state.progress),
    show(state)
  );

  // 8 — rembobinage complet de la nouvelle video
  await scrollTo(0);
  state = await read();
  await shot('08-haut-v2');
  record(8, 'La video 2 se rembobine jusqu a 00:00', state.time < 0.1 && shows(state, 'v2'), show(state));

  // 9 — mise en pause hors ecran
  await scrollTo(geometry.pageBottom);
  const idleFirst = await read();
  await page.waitForTimeout(1000);
  const idleSecond = await read();
  await shot('09-hors-ecran');
  record(9, 'La video est figee quand la section 2 sort de l ecran', idleFirst.mode === 'idle' && idleFirst.time === idleSecond.time, `${show(idleFirst)} puis currentTime=${idleSecond.time}`);

  // 10 — reprise
  await scrollTo(geometry.loopTop);
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
  record(11, 'Le use-case 1 restaure la video 1', shows(state, 'v1'), show(state));

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
