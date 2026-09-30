import { describeHero, sourceFor, posterFor } from './config.js';
import { Mp4VideoLayer } from './layers/Mp4VideoLayer.js';
import { pickWidth, prefersReducedMotion } from './env.js';
import { installUnlock } from './unlock.js';
import { clamp01 } from './utils.js';

const STATE_ATTRIBUTE = 'data-vb-hero-state';
const ACTIVE_ATTRIBUTE = 'data-vb-hero-active';

/**
 * Section Heros : une video scrubbee par le scroll derriere un titre fixe,
 * dont le texte change a 1/3 et 2/3 de la piste.
 *
 * Independante de Protocol (Stage, scroll.js) : un seul scrub, pas de boucle
 * ni de use-case, donc un cablage direct scroll -> couche video, sans machine
 * a etats. Seul `Mp4VideoLayer` est partage, pour sa file de seeks qui tient
 * sous Safari.
 *
 * Structure attendue (voir docs/webflow-setup.md) :
 *
 *   [data-vb-hero]                 la piste, sa hauteur fixe la course
 *     [data-vb-hero-inner]         colle, 100dvh
 *       video[data-vb-hero-video]
 *       [data-vb-hero-copy]        les textes, empiles au meme endroit
 *         [data-vb-hero-step="0"]  (puis 1, 2...)
 */

/** Etape de texte pour une progression 0 -> 1. 1/3 exact bascule deja sur l'etape 1. */
export function stepForProgress(progress, steps = 3) {
  return Math.min(steps - 1, Math.floor(clamp01(progress) * steps));
}

/** Les blocs `[data-vb-hero-step]`, ranges par leur numero et non par l'ordre du DOM. */
export function collectSteps(root) {
  return [...root.querySelectorAll('[data-vb-hero-step]')].sort(
    (a, b) => Number(a.getAttribute('data-vb-hero-step')) - Number(b.getAttribute('data-vb-hero-step'))
  );
}

/**
 * Point d'entree du bundle : lit le DOM, cree la couche MP4, cable le tout.
 * Resout `null` si la page n'a pas de Heros (rien a faire, rien a signaler).
 */
export async function startHero(config) {
  const root = document.querySelector('[data-vb-hero]');
  if (!root) return null;

  const video = root.querySelector('[data-vb-hero-video]');
  if (!video) {
    console.warn('[scroll-video] [data-vb-hero] sans video[data-vb-hero-video], Heros desactive');
    root.setAttribute(STATE_ATTRIBUTE, 'error');
    return null;
  }

  const width = pickWidth(config.widths);
  const description = describeHero(video, config);
  // Le poster occupe l'ecran le temps que le MP4 arrive, et reste seul en
  // reduced motion.
  video.poster = posterFor(description, width, config);

  if (prefersReducedMotion()) {
    root.setAttribute(STATE_ATTRIBUTE, 'reduced');
    // Les textes suivent toujours le scroll, sans animation ni video.
    return initHero({ root, layer: null, config, animate: false });
  }

  root.setAttribute(STATE_ATTRIBUTE, 'loading');

  const layer = new Mp4VideoLayer({
    id: description.id,
    element: video,
    src: sourceFor(description, width, config),
    segments: description.segments,
    fps: description.fps,
    preloadTimeoutMs: config.preloadTimeoutMs,
  });

  // Les textes n'attendent pas la video : ils sont lisibles des le premier
  // scroll, meme si le MP4 met du temps a arriver.
  const hero = initHero({ root, layer: null, config });

  try {
    await layer.preload();
  } catch (error) {
    console.error('[scroll-video]', error);
    root.setAttribute(STATE_ATTRIBUTE, 'error');
    return hero;
  }

  // Sans `data-vb-hero-end`, le scrub parcourt tout le fichier.
  if (layer.segments.scrub.end == null) layer.segments.scrub.end = video.duration;

  hero.attachLayer(layer);
  installUnlock([layer], () => hero.resync());
  root.setAttribute(STATE_ATTRIBUTE, 'ready');
  return hero;
}

/**
 * Cablage scroll -> video + textes. Separe de `startHero` pour qu'une autre
 * implementation de `VideoLayer` puisse s'y brancher a la place du MP4.
 *
 * `layer` peut arriver plus tard via `attachLayer` : la video se cale alors
 * sur la position de scroll du moment.
 */
export function initHero({ root, layer = null, config, animate = true }) {
  const { gsap, ScrollTrigger, SplitText } = requireGsap();
  gsap.registerPlugin(ScrollTrigger);
  if (SplitText) gsap.registerPlugin(SplitText);

  const { steps: stepCount, staggerMs } = config.hero;
  const steps = collectSteps(root);
  const texts = createTexts({ gsap, SplitText, steps, stagger: staggerMs / 1000, animate });

  const proxy = { p: 0 };
  let current = -1;

  const apply = (progress) => {
    if (layer) layer.seek(layer.timeForProgress(progress));

    const step = stepForProgress(progress, stepCount);
    if (step === current) return;
    const previous = current;
    current = step;
    root.setAttribute(ACTIVE_ATTRIBUTE, String(step));
    texts.show(step, previous);
  };

  // Un tween sur un objet proxy plutot qu'un `onUpdate` du trigger : c'est ce
  // qui donne a `scrub` son inertie (meme approche que scroll.js).
  const tween = gsap.to(proxy, {
    p: 1,
    ease: 'none',
    scrollTrigger: {
      trigger: root,
      start: 'top top',
      // Fin de la course quand le bas de la piste touche le bas de l'ecran :
      // le conteneur colle s'y decolle, la video est sur sa derniere image.
      end: 'bottom bottom',
      scrub: config.scrubSmoothing,
      invalidateOnRefresh: true,
    },
    onUpdate: () => apply(proxy.p),
  });

  // Position initiale, y compris apres un rechargement en milieu de page.
  ScrollTrigger.refresh();
  proxy.p = tween.scrollTrigger.progress;
  apply(proxy.p);

  return {
    get progress() {
      return proxy.p;
    },
    get step() {
      return current;
    },
    get layer() {
      return layer;
    },
    attachLayer(next) {
      layer = next;
      layer.show(0);
      layer.hardSeek(layer.timeForProgress(proxy.p));
    },
    /** Apres le deblocage iOS : `unlock()` a lance une lecture, on la coupe. */
    resync() {
      if (!layer) return;
      layer.pause();
      layer.hardSeek(layer.timeForProgress(proxy.p));
    },
    destroy() {
      tween.scrollTrigger?.kill();
      tween.kill();
      texts.destroy();
      layer?.destroy();
    },
  };
}

/**
 * Bascule entre les blocs de texte, ligne par ligne.
 *
 * Chaque bloc est decoupe en lignes par SplitText (`mask` : chaque ligne vit
 * dans un cache `overflow: clip`, elle glisse donc hors de sa boite au lieu
 * de simplement s'estomper). Sortie vers le haut, entree par le bas quand on
 * descend ; l'inverse quand on remonte.
 *
 * Etat de repos, que tout re-decoupage peut retrouver sans rien savoir de
 * l'animation en cours : lignes a `yPercent: 0`, seul le bloc actif visible.
 */
function createTexts({ gsap, SplitText, steps, stagger, animate }) {
  if (!SplitText && animate && steps.length > 0) {
    console.warn(
      '[scroll-video] SplitText absent (voir webflow/footer.html) : bascule des textes par bloc, sans decoupage en lignes'
    );
  }

  let timeline = null;
  let active = -1;
  // En reduced motion rien ne bouge : inutile de decouper.
  const useSplit = Boolean(SplitText) && animate;

  const splits = [];

  // `onSplit` part pendant les `SplitText.create`, avant que `splits` ne soit
  // complet : un bloc pas encore decoupe n'a simplement pas de lignes.
  const linesOf = (index) =>
    useSplit ? (splits[index]?.lines ?? []) : [...steps[index].children];

  const setVisible = (index, visible) => {
    const step = steps[index];
    if (!step) return;
    // Style direct plutot que `gsap.set` : plusieurs `set` du meme element dans
    // un meme tick peuvent etre differes par GSAP, et le dernier ne pas gagner.
    // `visible` explicite, pas '' : la feuille de style masque les etapes 1+
    // avant le script.
    step.style.visibility = visible ? 'visible' : 'hidden';
    // Les blocs masques restent dans le DOM (ils donnent sa hauteur a la
    // pile) : on les retire de l'arbre d'accessibilite.
    if (visible) step.removeAttribute('aria-hidden');
    else step.setAttribute('aria-hidden', 'true');
  };

  /** Coupe toute animation et pose l'etat de repos, `shown` seul visible. */
  function settle(shown = active) {
    timeline?.kill();
    timeline = null;
    steps.forEach((_, index) => {
      const lines = linesOf(index);
      if (lines.length > 0) gsap.set(lines, { yPercent: 0, autoAlpha: 1 });
      setVisible(index, index === shown);
    });
  }

  // SplitText decoupe les enfants directs (titre, paragraphe) : decouper le
  // bloc entier melangerait leurs lignes dans un seul flux.
  if (useSplit) {
    for (const step of steps) {
      splits.push(
        SplitText.create(step.children, {
          type: 'lines',
          mask: 'lines',
          linesClass: 'vb-hero-line',
          // Re-decoupe au redimensionnement et une fois les polices chargees :
          // une ligne coupee sur une police de repli serait fausse ensuite.
          autoSplit: true,
          onSplit: () => settle(),
        })
      );
    }
  }

  steps.forEach((_, index) => setVisible(index, false));

  return {
    show(next, previous) {
      active = next;

      // Premier affichage, reduced motion, ou bloc manquant : pas d'animation.
      if (!animate || previous < 0 || !steps[previous] || !steps[next]) {
        settle();
        return;
      }

      // Une bascule arrive pendant une autre (scroll rapide) : on pose d'un
      // coup l'etape visee par la precedente, puis on repart de la. Pas de
      // file d'attente, jamais deux blocs a moitie visibles.
      if (timeline) settle(previous);

      const direction = next > previous ? 1 : -1;
      const outgoing = linesOf(previous);
      const incoming = linesOf(next);

      timeline = gsap
        .timeline({ onComplete: () => (timeline = null) })
        .to(outgoing, {
          yPercent: -100 * direction,
          autoAlpha: 0,
          duration: 0.35,
          ease: 'power2.in',
          stagger,
        })
        .add(() => {
          setVisible(previous, false);
          gsap.set(outgoing, { yPercent: 0, autoAlpha: 1 });
          setVisible(next, true);
        })
        .fromTo(
          incoming,
          { yPercent: 100 * direction, autoAlpha: 0 },
          { yPercent: 0, autoAlpha: 1, duration: 0.6, ease: 'power3.out', stagger }
        );
    },
    destroy() {
      timeline?.kill();
      for (const split of splits) split.revert();
    },
  };
}

/**
 * GSAP est charge depuis le CDN avant ce script (voir webflow/footer.html).
 * SplitText est optionnel : sans lui, les blocs basculent d'un seul tenant.
 */
function requireGsap() {
  const gsap = window.gsap;
  const globals = gsap?.core?.globals?.() ?? {};
  const ScrollTrigger = window.ScrollTrigger || globals.ScrollTrigger;
  const SplitText = window.SplitText || globals.SplitText || null;

  if (!gsap || !ScrollTrigger) {
    throw new Error(
      '[scroll-video] gsap et ScrollTrigger doivent etre charges avant ce script (voir webflow/footer.html)'
    );
  }

  return { gsap, ScrollTrigger, SplitText };
}
