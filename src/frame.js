import { clamp01 } from './utils.js';

/**
 * Cadrage des couches video.
 *
 * Le fond ne reste plein ecran que le temps du debut de course. Passe le seuil
 * fixe par `dockRange`, il vient se caler sur l'element de la section 2 qui
 * porte `data-vb-frame`, et le suit tant qu'il defile.
 *
 * Le mouvement est **pilote par le scroll**, pas par une duree : la position du
 * fond est une fonction de la progression du scrub, exactement comme le
 * timecode de la video. Remonter le defait donc aussi surement qu'il l'a fait,
 * et s'arreter a mi-course laisse le fond a mi-chemin. C'est ce qui le garde
 * solidaire du reste de la mise en scene, elle aussi accrochee a `--vb-scrub`.
 *
 * La geometrie est publiee en variables CSS sur le stage plutot qu'ecrite sur
 * chaque couche : les deux videos, le poster et tout ce que le designer voudra
 * ajouter se recadrent alors ensemble, sans que le JS ait a les connaitre.
 *
 * Le recadrage passe par `left/top/width/height` et non par un `transform`.
 * Un `scale` non uniforme deformerait l'image, la cible n'ayant pas le format
 * du viewport ; en changeant la boite, `object-fit: cover` recadre au lieu
 * d'etirer, ce qui est le rendu attendu.
 *
 * Sans `[data-vb-frame]` dans la page, ce module ne fait rien : le fond reste
 * plein ecran d'un bout a l'autre, comme avant.
 */

const VARIABLES = ['--vb-frame-x', '--vb-frame-y', '--vb-frame-w', '--vb-frame-h'];

export function initFrame({ stage, config, stageElement, root = document }) {
  const target = root.querySelector('[data-vb-frame]');
  if (!target) return { destroy() {} };

  const range = config.dockRange ?? {};
  const from = clamp01(range.start ?? 0);
  const to = clamp01(range.end ?? 1);
  const span = to - from;

  /** 0 = plein cadre, 1 = cale sur la cible. Les valeurs entre les deux sont le mouvement. */
  let progress = 0;
  let raf = 0;
  let painted = '';

  /**
   * Une plage vide ou inversee n'a pas de milieu : plutot que de diviser par
   * zero, on la traite comme une bascule seche au point de depart.
   */
  const dockFor = (value) => (span > 0 ? clamp01((value - from) / span) : value >= from ? 1 : 0);

  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(tick);
  };

  function tick() {
    raf = 0;
    paint();

    // Une fois calee, la cible continue de defiler avec la page : il faut la
    // resuivre image par image. En plein cadre au contraire, plus rien ne
    // bouge et la boucle s'arrete.
    if (progress !== 0) schedule();
  }

  function paint() {
    if (progress === 0) {
      if (painted === '') return;
      painted = '';
      for (const name of VARIABLES) stageElement.style.removeProperty(name);
      stageElement.style.removeProperty('--vb-dock');
      return;
    }

    // Les couches sont en `position: absolute` dans le stage : leurs
    // coordonnees sont relatives a lui, jamais au viewport. C'est ce qui rend
    // le calcul valable quel que soit le positionnement du stage, y compris
    // sticky dans un conteneur.
    const stageRect = stageElement.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    const box = [
      mix(0, targetRect.left - stageRect.left, progress),
      mix(0, targetRect.top - stageRect.top, progress),
      mix(stageRect.width, targetRect.width, progress),
      mix(stageRect.height, targetRect.height, progress),
    ].map((value) => Math.round(value * 100) / 100);

    const signature = `${box.join(',')}|${progress}`;
    if (signature === painted) return;
    painted = signature;

    VARIABLES.forEach((name, index) => {
      stageElement.style.setProperty(name, `${box[index]}px`);
    });
    stageElement.style.setProperty('--vb-dock', String(Math.round(progress * 1000) / 1000));
  }

  const off = stage.on('progress', (value) => {
    const next = dockFor(value);
    if (next === progress) return;
    progress = next;
    schedule();
  });

  // Un rechargement en pleine section 2 doit trouver le fond deja cale, pas le
  // voir s'y rendre : l'etat initial se lit, il ne s'anime pas.
  progress = dockFor(stage.progress);
  paint();
  if (progress !== 0) schedule();

  return {
    get progress() {
      return progress;
    },
    destroy() {
      off();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      progress = 0;
      paint();
    },
  };
}

function mix(a, b, t) {
  return a + (b - a) * t;
}
