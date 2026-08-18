/**
 * Contrat commun a toutes les couches d'image du fond.
 *
 * Le Stage ne connait que cette interface : il ignore totalement si le rendu
 * vient d'une balise <video> ou d'un <canvas> alimente par une sequence
 * d'images. Migrer vers le rendu canvas revient donc a ecrire une seconde
 * implementation de cette classe et a la substituer dans main.js, sans
 * toucher a la machine a etats ni au pilotage du scroll.
 *
 * Regles que toute implementation doit respecter :
 *  - `seek` est appele a haute frequence pendant le scroll et doit donc etre
 *    non bloquant et tolerant a la saturation (coalescence des demandes).
 *  - `waitForFrame` doit toujours se resoudre, y compris si aucune image
 *    nouvelle n'arrive : le Stage s'en sert pour sequencer ses fondus.
 *  - une couche masquee ne doit rien decoder.
 */
export class VideoLayer {
  /**
   * @param {string} id
   * @param {{ scrub: {start: number, end: number}, loop: {start: number, end: number} }} segments
   *   Decoupage propre a cette video. Chaque source ayant sa propre duree
   *   d'intro, les bornes ne peuvent pas etre globales.
   */
  constructor(id, segments) {
    this.id = id;
    this.segments = segments;
  }

  /** Instant correspondant a une progression de scroll de 0 a 1. */
  timeForProgress(progress) {
    const { start, end } = this.segments.scrub;
    return start + (end - start) * progress;
  }

  /** Vrai quand la couche a assez de donnees pour afficher n'importe quelle image. */
  get ready() {
    return false;
  }

  /** Instant affiche, en secondes. L'UI s'en sert pour suivre la boucle. */
  get currentTime() {
    return 0;
  }

  /** Charge les donnees necessaires. Idempotent, renvoie toujours la meme promesse. */
  preload() {
    return Promise.reject(new Error('preload() non implemente'));
  }

  /**
   * Debloque le decodeur apres un geste utilisateur.
   * Sur iOS, tant qu'aucune lecture n'a ete autorisee, les seeks ne rendent rien.
   * Renvoie false si le deblocage a echoue et doit etre retente.
   */
  unlock() {
    return Promise.resolve(true);
  }

  /** Demande d'affichage de l'image a `time`. Coalescee, jamais bloquante. */
  seek(_time) {
    throw new Error('seek() non implemente');
  }

  /** Positionnement immediat, sans passer par la file de seeks. */
  hardSeek(_time) {
    throw new Error('hardSeek() non implemente');
  }

  /** Lecture autonome en boucle sur le sous-segment [start, end]. */
  playLoop(_start, _end) {
    throw new Error('playLoop() non implemente');
  }

  /** Arrete toute lecture autonome. La couche reste affichee sur son image courante. */
  pause() {
    throw new Error('pause() non implemente');
  }

  show(_fadeMs) {
    throw new Error('show() non implemente');
  }

  hide(_fadeMs) {
    throw new Error('hide() non implemente');
  }

  /** Ordonne les couches entre elles pendant un fondu croise. */
  setDepth(_depth) {
    throw new Error('setDepth() non implemente');
  }

  /** Se resout des qu'une image a effectivement ete presentee (ou au timeout). */
  waitForFrame(_timeoutMs) {
    return Promise.resolve();
  }

  destroy() {}
}
