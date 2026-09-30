import Lenis from 'lenis';
import { prefersReducedMotion } from './env.js';

/**
 * Smooth scroll du site entier (Lenis), actif sur toutes les pages qui
 * chargent le bundle, qu'elles aient un Heros, Protocol, ou rien.
 *
 * Principe : Lenis ne remplace pas le scroll natif, il l'intercepte. La
 * molette ne fait plus sauter la page ; Lenis fixe une cible et y amene
 * `window.scrollY` par petits pas, a chaque image. Le reste du code
 * (ScrollTrigger, IntersectionObserver, sticky) continue de lire la position
 * native, comme sans Lenis.
 *
 * Deux regles pour cohabiter avec GSAP :
 *  - une seule horloge : Lenis avance sur le ticker de GSAP plutot que sur
 *    son propre requestAnimationFrame, sinon les deux boucles se decalent
 *    d'une image et le scrub tremble ;
 *  - ScrollTrigger est prevenu a chaque pas (`ScrollTrigger.update`), au
 *    lieu d'attendre l'evenement `scroll` natif du navigateur.
 *
 * Le tactile n'est pas lisse (defaut Lenis, `syncTouch: false`) : iOS et
 * Android ont deja leur propre inertie, la doubler degrade la sensation.
 */

let lenis = null;

/**
 * Demarre Lenis. Resout `null` si le visiteur demande moins d'animations ou
 * si la config le coupe (`smooth: false`) : le scroll natif reste alors seul.
 */
export function startSmooth(config) {
  if (lenis || !config.smooth || prefersReducedMotion()) return lenis;

  const { gsap, ScrollTrigger } = window;
  // Sans GSAP (page qui ne charge pas le footer complet), Lenis tourne sur
  // sa propre boucle : il n'y a alors aucun ScrollTrigger a synchroniser.
  const withGsap = Boolean(gsap);

  lenis = new Lenis({
    ...config.lenis,
    autoRaf: !withGsap,
    // Liens d'ancre internes (#contact...) : defilement lisse plutot qu'un saut.
    anchors: true,
  });

  if (withGsap) {
    if (ScrollTrigger) lenis.on('scroll', ScrollTrigger.update);
    // Le ticker GSAP donne des secondes, Lenis attend des millisecondes.
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    // Sans ca, apres un onglet en arriere-plan GSAP "rattrape" le temps
    // perdu d'un coup et Lenis ferait un bond.
    gsap.ticker.lagSmoothing(0);
  }

  window.lenis = lenis;
  return lenis;
}

/**
 * Deplace la page instantanement, sans animation.
 *
 * `window.scrollTo` seul ne suffit pas quand Lenis tourne : s'il est en train
 * d'animer vers une cible, il y reviendrait a l'image suivante. On passe donc
 * par lui (`immediate` = pas d'animation, `force` = meme s'il est stoppe).
 */
export function jumpTo(y) {
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
  else window.scrollTo(0, y);
}
