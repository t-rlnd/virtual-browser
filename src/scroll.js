import { MODES } from './Stage.js';

const LATCHED_ATTRIBUTE = 'data-vb-latched';
const COLLAPSED_HEIGHT = '100dvh';

/**
 * Cablage du scroll, via GSAP ScrollTrigger.
 *
 * Deux declencheurs, et un seul decide :
 *  1. le scrub, sur la course d'epinglage de la piste. Son terme, et lui seul,
 *     fait entrer en boucle ;
 *  2. la visibilite de la piste, qui ne fait que mettre la boucle en pause
 *     quand elle sort de l'ecran et la reprendre quand elle revient.
 *
 * `track` est l'element `[data-vb-scrub]` : la piste entiere, section 2
 * comprise puisqu'elle lui est superposee.
 *
 * Une fois la boucle atteinte et le verrou arme, la piste est ramenee a
 * `100dvh` : le scrub deja consomme (et la reserve) ne servent plus, et
 * laisseraient un long scroll mort. Le scroll est recale dans la meme
 * foulee, sinon le sticky decroche — on a deja parcouru plus d'un ecran
 * dans une piste qui vient de retrecir.
 */
export function initScroll({ stage, config, track }) {
  const { gsap, ScrollTrigger } = requireGsap();
  gsap.registerPlugin(ScrollTrigger);

  const proxy = { p: 0 };
  const html = document.documentElement;

  /**
   * Fin de la course de scrub.
   *
   * La section 2 etant superposee a la section 1 dans le meme conteneur colle,
   * sa position ne dit plus rien : elle est figee a l'ecran du debut a la fin.
   * C'est donc la piste qui porte la mesure, et le scrub s'arrete avant son
   * terme.
   *
   * La course d'epinglage vaut `hauteur de piste - 100vh`, la derniere hauteur
   * d'ecran etant consommee par le conteneur colle. `loopReserve` en retranche
   * autant : c'est le temps de scroll pendant lequel la video boucle dans son
   * cadre, section 2 sous les yeux. Sans reserve, la boucle prendrait la main
   * au moment ou le conteneur se decolle, c'est-a-dire hors de vue.
   */
  const reserve = Math.max(0, config.loopReserve ?? 0);
  const end = () => {
    const travel = track.offsetHeight - window.innerHeight * (1 + reserve);
    // Une piste trop courte pour la reserve demandee ne doit pas produire une
    // course negative, que ScrollTrigger lirait comme un declenchement immediat.
    return `+=${Math.max(1, Math.round(travel))}`;
  };

  /**
   * Le verrou de boucle. Une fois arme, le scrub ne reprend plus la main : la
   * video reste calee dans son cadre, et seule la visibilite de la piste decide
   * encore entre boucle et pause. Rien n'est tue pour autant, le declencheur de
   * scrub cesse simplement d'agir — ce qui permet de relacher le verrou par
   * configuration sans rien recabler.
   */
  const latching = config.latchLoop !== false;
  let latched = false;
  let collapsed = false;

  /**
   * Le scrub a-t-il deja atteint son terme au moins une fois ? La section 2
   * etant superposee, elle est a l'ecran des le premier pixel : sans ce
   * garde-fou, le declencheur de visibilite lancerait la boucle — et armerait
   * le verrou — avant meme que le scrub ait commence.
   */
  let reached = false;

  /**
   * Ramene la piste a une hauteur d'ecran une fois le verrou arme.
   *
   * Sans compensation, reduire `[data-vb-scrub]` alors qu'on a deja scrolle
   * dedans fait partir le sticky vers le haut : le haut de la piste ne
   * bouge pas (elle retrecit par le bas), `scrollY` se retrouve au-dela.
   * Deux cas :
   *  - entree live : recaler sur `offsetTop` pour garder UseCase plein ecran ;
   *  - reload deja sous la section : retrancher le delta pour que le
   *    contenu en cours de lecture ne saute pas.
   *
   * Accroche a `data-vb-latched`, pas a `data-vb-mode` : en `idle` (piste
   * quittee) le mode changerait et la piste reprendrait 300vh, ce qui
   * ferait sauter toute la page.
   */
  const collapseTrack = ({ keepTrackInView, deferRefresh = false }) => {
    if (collapsed || !latching) return;

    const heightBefore = track.offsetHeight;
    const scrollBefore = window.scrollY;

    html.setAttribute(LATCHED_ATTRIBUTE, 'true');
    track.style.height = COLLAPSED_HEIGHT;
    collapsed = true;

    const shrink = heightBefore - track.offsetHeight;

    if (keepTrackInView) {
      window.scrollTo(0, track.offsetTop);
    } else if (shrink > 0 && scrollBefore > track.offsetTop) {
      window.scrollTo(0, Math.max(track.offsetTop, scrollBefore - shrink));
    }

    // `enterLoop` est appele depuis `onLeave` : refresh() ici reentrerait
    // dans ScrollTrigger en cours de tick. La frame suivante suffit.
    if (deferRefresh) {
      requestAnimationFrame(() => ScrollTrigger.refresh());
    } else {
      ScrollTrigger.refresh();
    }
  };

  const enterScrub = () => {
    if (!latched) stage.setMode(MODES.SCRUB);
  };

  const enterLoop = () => {
    reached = true;
    latched = latching;
    // Le lissage laisse la progression en retard sur le scroll : au moment ou
    // la boucle prend la main, elle peut n'etre qu'a 0.75. La figer la
    // arreterait la mise en scene avant son terme. La boucle commence a 1.
    stage.setProgress(1);
    stage.setMode(MODES.LOOP);
    collapseTrack({ keepTrackInView: true, deferRefresh: true });
  };

  const scrubTween = gsap.to(proxy, {
    p: 1,
    ease: 'none',
    scrollTrigger: {
      trigger: track,
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

  // Ce declencheur ne fait que reprendre une boucle deja atteinte ; il ne la
  // decide jamais.
  const resumeLoop = () => {
    if (reached && stage.mode === MODES.IDLE) enterLoop();
  };

  const visibility = ScrollTrigger.create({
    trigger: track,
    start: 'top bottom',
    end: 'bottom top',
    onEnter: resumeLoop,
    onEnterBack: resumeLoop,
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

  if (scrubTrigger.progress < 1) {
    stage.setMode(MODES.SCRUB);
  } else if (visibility.isActive) {
    enterLoop();
  } else {
    // Rechargement passe la section 2 : le verrou doit deja etre arme, sinon
    // remonter rembobinerait une video que le visiteur a deja vue boucler.
    reached = true;
    latched = latching;
    collapseTrack({ keepTrackInView: false });
    stage.setMode(MODES.IDLE);
  }

  return {
    destroy() {
      html.removeAttribute(LATCHED_ATTRIBUTE);
      track.style.removeProperty('height');
      collapsed = false;
      scrubTween.kill();
      scrubTrigger.kill();
      visibility.kill();
    },
  };
}

/**
 * GSAP est charge depuis le CDN avant ce script plutot que bundle : ca evite
 * d'embarquer 70 ko deja presents sur la plupart des projets Webflow.
 */
function requireGsap() {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger || gsap?.core?.globals?.().ScrollTrigger;

  if (!gsap || !ScrollTrigger) {
    throw new Error(
      '[scroll-video] gsap et ScrollTrigger doivent etre charges avant ce script (voir webflow/footer.html)'
    );
  }

  return { gsap, ScrollTrigger };
}
