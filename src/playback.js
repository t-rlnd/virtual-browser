import { initScroll } from './scroll.js';
import { initCompact } from './compact.js';
import { compactQuery, isCompactViewport } from './env.js';

const ATTRIBUTE = 'data-vb-compact';

/**
 * Choisit le cablage : course de scrub au-dessus du breakpoint, boucle
 * calee dans le cadre en dessous. Rebranche au passage de la frontiere
 * (rotation, redimensionnement).
 *
 * L'attribut `data-vb-compact="true"` est pose sur `<html>` pour que la
 * page (et le Designer) accroche le layout empile sans dupliquer le
 * breakpoint.
 */
export function initPlayback({
  stage,
  config,
  track,
  root = document,
  element = document.documentElement,
}) {
  const maxWidth = config.compactMaxWidth ?? 991;
  const query = compactQuery(maxWidth);
  let controller = null;

  const apply = () => {
    controller?.destroy();
    controller = null;

    const compact = query ? query.matches : isCompactViewport(maxWidth);
    if (compact) {
      element.setAttribute(ATTRIBUTE, 'true');
    } else {
      element.removeAttribute(ATTRIBUTE);
    }

    controller = compact
      ? initCompact({ stage, root })
      : initScroll({ stage, config, track });
  };

  apply();
  query?.addEventListener('change', apply);

  return {
    destroy() {
      query?.removeEventListener('change', apply);
      controller?.destroy();
      element.removeAttribute(ATTRIBUTE);
    },
  };
}
