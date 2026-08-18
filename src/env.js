/** Detection des capacites et preferences du navigateur. */

function matches(query) {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

export function prefersReducedMotion() {
  return matches('(prefers-reduced-motion: reduce)');
}

export function isCoarsePointer() {
  return matches('(pointer: coarse)');
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
