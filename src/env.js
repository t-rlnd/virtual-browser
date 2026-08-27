/** Detection des capacites et preferences du navigateur. */

function matches(query) {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches
  );
}

export function prefersReducedMotion() {
  return matches('(prefers-reduced-motion: reduce)');
}

/**
 * Tablette et mobile Webflow : plus de course de scrub, les sections
 * s'empilent et la video boucle dans son cadre.
 */
export function isCompactViewport(maxWidth = 991) {
  return matches(`(max-width: ${maxWidth}px)`);
}

/** Media query correspondant a `isCompactViewport`, pour ecouter les rotations. */
export function compactQuery(maxWidth = 991) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(`(max-width: ${maxWidth}px)`);
}

export function saveDataEnabled() {
  return Boolean(navigator.connection && navigator.connection.saveData);
}

/**
 * Choisit la plus petite largeur encodee couvrant le viewport.
 * Le devicePixelRatio est plafonne a 2 : au-dela le gain est invisible et le
 * poids double pour rien.
 */
export function pickWidth(widths) {
  const sorted = [...widths].sort((a, b) => a - b);
  if (saveDataEnabled()) return sorted[0];

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const needed = window.innerWidth * dpr;
  return sorted.find((w) => w >= needed) ?? sorted[sorted.length - 1];
}
