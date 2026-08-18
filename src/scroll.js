import { MODES } from './Stage.js';
import { isCoarsePointer } from './env.js';

/**
 * GSAP est charge depuis le CDN avant ce script plutot que bundle : ca evite
 * d'embarquer 70 ko deja presents sur la plupart des projets Webflow.
 */
function requireGsap() {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger || gsap?.core?.globals?.().ScrollTrigger;

  if (!gsap || !ScrollTrigger) {
    throw new Error(
      '[scroll-video] gsap et ScrollTrigger doivent etre charges avant ce script (voir webflow/head.html)'
    );
  }

  return { gsap, ScrollTrigger };
}

export function initScroll({ stage, config, elements }) {
  const { gsap, ScrollTrigger } = requireGsap();
  gsap.registerPlugin(ScrollTrigger);

  const degraded = config.mobileMode === 'autoplay' && isCoarsePointer();
  return degraded
    ? initAutoplay({ stage, elements, ScrollTrigger })
    : initScrub({ stage, config, elements, gsap, ScrollTrigger });
}

/** Mode nominal : scrub sur la section 1, boucle sur la section 2. */
function initScrub({ stage, config, elements, gsap, ScrollTrigger }) {
  const proxy = { p: 0 };

  const scrubTween = gsap.to(proxy, {
    p: 1,
    ease: 'none',
    scrollTrigger: {
      trigger: elements.scrub,
      start: 'top top',
      // Le scrub ne s'arrete pas a la fin de la section 1 : il se poursuit
      // pendant que la section 2 monte, et n'atteint son terme qu'au moment
      // ou celle-ci occupe tout l'ecran.
      endTrigger: elements.loop,
      end: 'top top',
      scrub: config.scrubSmoothing,
      onEnter: () => stage.setMode(MODES.SCRUB),
      onEnterBack: () => stage.setMode(MODES.SCRUB),
      onLeaveBack: () => stage.setMode(MODES.SCRUB),
      onLeave: () => stage.setMode(MODES.LOOP),
    },
    onUpdate: () => stage.setProgress(proxy.p),
  });

  // La boucle ne tourne que tant que la section 2 mord sur le viewport.
  // Une fois entierement sortie, plus rien ne doit se decoder.
  const enterLoopIfIdle = () => {
    if (stage.mode === MODES.IDLE) stage.setMode(MODES.LOOP);
  };

  const visibility = ScrollTrigger.create({
    trigger: elements.loop,
    start: 'top bottom',
    end: 'bottom top',
    onEnter: enterLoopIfIdle,
    onEnterBack: enterLoopIfIdle,
    onLeave: () => stage.setMode(MODES.IDLE),
    // onLeaveBack : on remonte dans la section 1, le trigger de scrub decide.
  });

  const scrubTrigger = scrubTween.scrollTrigger;

  // ScrollTrigger ne rejoue pas ses callbacks pour l'etat initial : sur un
  // rechargement en milieu de page, il faut deduire le mode nous-memes.
  ScrollTrigger.refresh();
  stage.setProgress(scrubTrigger.progress);
  if (scrubTrigger.progress >= 1) {
    stage.setMode(visibility.isActive ? MODES.LOOP : MODES.IDLE);
  } else {
    stage.setMode(MODES.SCRUB);
  }

  return {
    destroy() {
      scrubTween.kill();
      scrubTrigger.kill();
      visibility.kill();
    },
  };
}

/**
 * Mode degrade pour pointeur grossier : pas de scrub, la video boucle
 * simplement tant qu'une des deux sections est a l'ecran.
 */
function initAutoplay({ stage, elements, ScrollTrigger }) {
  const triggers = [];
  const sync = () => {
    const visible = triggers.some((trigger) => trigger.isActive);
    stage.setMode(visible ? MODES.LOOP : MODES.IDLE);
  };

  for (const trigger of [elements.scrub, elements.loop]) {
    triggers.push(
      ScrollTrigger.create({ trigger, start: 'top bottom', end: 'bottom top', onToggle: sync })
    );
  }

  ScrollTrigger.refresh();
  sync();

  return {
    destroy() {
      triggers.forEach((trigger) => trigger.kill());
    },
  };
}
