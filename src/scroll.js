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

  /**
   * Le point de bascule. La section 2 etant superposee a la section 1 dans le
   * meme conteneur colle, sa position ne dit plus rien : elle est figee a
   * l'ecran du debut a la fin. C'est donc la piste elle-meme qui porte la
   * mesure, et le scrub s'arrete avant son terme.
   *
   * La hauteur laissee libre est la reserve : le temps de scroll pendant lequel
   * la video boucle dans son cadre, section 2 sous les yeux. Sans elle, la
   * boucle prendrait la main au moment ou le conteneur se decolle, c'est-a-dire
   * hors de vue.
   *
   * La course d'epinglage vaut `hauteur de piste - 100vh`, la derniere hauteur
   * d'ecran etant consommee par le conteneur colle lui-meme. Une reserve de 1
   * sur une piste de 300vh laisse donc 100vh de scrub et 100vh de boucle.
   */
  const reserve = Math.max(0, config.loopReserve ?? 0);
  const end = () => {
    const travel = elements.scrub.offsetHeight - window.innerHeight * (1 + reserve);
    // Une piste trop courte pour la reserve demandee ne doit pas produire une
    // course negative, que ScrollTrigger lirait comme un declenchement immediat.
    return `+=${Math.max(1, Math.round(travel))}`;
  };

  /**
   * Le verrou de boucle. Une fois arme, le scrub ne reprend plus la main : la
   * video reste calee dans son cadre, et c'est la seule visibilite de la
   * section 2 qui decide encore entre boucle et pause.
   *
   * Rien n'est tue pour autant — le ScrollTrigger de scrub continue de suivre
   * la page, il cesse simplement d'agir. C'est ce qui permet de relacher le
   * verrou par configuration sans rien recabler.
   */
  const latching = config.latchLoop !== false;
  let latched = false;

  /**
   * Le scrub a-t-il deja atteint son terme au moins une fois ? La question ne
   * se posait pas tant que la section 2 vivait sous la ligne de flottaison :
   * superposee, elle est a l'ecran des le premier pixel, et le declencheur de
   * visibilite s'allume donc au chargement. Sans ce garde-fou il lancerait la
   * boucle — et armerait le verrou — avant meme que le scrub ait commence.
   */
  let reached = false;

  const enterScrub = () => {
    if (!latched) stage.setMode(MODES.SCRUB);
  };

  const enterLoop = () => {
    reached = true;
    latched = latching;
    // Le lissage du scrub laisse la progression en retard sur le scroll : au
    // moment ou la boucle prend la main, elle peut n'etre qu'a 0.75. La figer
    // la arreterait la mise en scene avant son terme, et le verrou la
    // laisserait ainsi. La boucle commence a 1, par definition.
    stage.setProgress(1);
    stage.setMode(MODES.LOOP);
  };

  const scrubTween = gsap.to(proxy, {
    p: 1,
    ease: 'none',
    scrollTrigger: {
      trigger: elements.scrub,
      start: 'top top',
      end,
      // `end` est une fonction : sans cela, la course calculee au chargement
      // resterait figee apres un changement de hauteur d'ecran.
      invalidateOnRefresh: true,
      scrub: config.scrubSmoothing,
      onEnter: enterScrub,
      onEnterBack: enterScrub,
      onLeaveBack: enterScrub,
      onLeave: enterLoop,
    },
    onUpdate: () => {
      if (!latched) stage.setProgress(proxy.p);
    },
  });

  // La boucle ne tourne que tant que la section 2 mord sur le viewport. Elle
  // est superposee au reste dans le conteneur colle : c'est donc la visibilite
  // de la piste qui la decrit, la sienne propre ne bougeant plus.
  // Ce declencheur ne fait que reprendre une boucle deja atteinte ; il ne la
  // decide jamais. C'est le terme du scrub, et lui seul, qui y fait entrer.
  const enterLoopIfIdle = () => {
    if (reached && stage.mode === MODES.IDLE) enterLoop();
  };

  const visibility = ScrollTrigger.create({
    trigger: elements.scrub,
    start: 'top bottom',
    end: 'bottom top',
    onEnter: enterLoopIfIdle,
    onEnterBack: enterLoopIfIdle,
    onLeave: () => stage.setMode(MODES.IDLE),
    // Sortie par le haut : sans verrou, le trigger de scrub reprend la main et
    // rembobine ; avec, il n'y a plus rien a afficher, donc rien a decoder.
    onLeaveBack: () => {
      if (latched) stage.setMode(MODES.IDLE);
    },
  });

  const scrubTrigger = scrubTween.scrollTrigger;

  // ScrollTrigger ne rejoue pas ses callbacks pour l'etat initial : sur un
  // rechargement en milieu de page, il faut deduire le mode nous-memes.
  ScrollTrigger.refresh();
  stage.setProgress(scrubTrigger.progress);
  if (scrubTrigger.progress >= 1) {
    // Un rechargement passe la section 2 arrive apres coup : le verrou doit
    // deja etre arme, sinon remonter rembobinerait une video que le visiteur
    // a pourtant deja vue boucler.
    if (visibility.isActive) enterLoop();
    else {
      latched = latching;
      stage.setMode(MODES.IDLE);
    }
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
