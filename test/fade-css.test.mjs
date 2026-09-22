/**
 * Contrat CSS : loop et fade partagent la meme courbe via custom properties.
 * Sans navigateur — lit la source pour empecher un drift de formules.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const css = readFileSync(new URL('../src/styles/scroll-video.css', import.meta.url), 'utf8');

describe('courbe fade / loop', () => {
  it('expose --vb-fade-start et --vb-fade-span une seule fois', () => {
    assert.match(css, /--vb-fade-start:\s*0\.3/);
    assert.match(css, /--vb-fade-span:\s*0\.3/);
    assert.equal((css.match(/--vb-fade-start:/g) || []).length, 1);
    assert.equal((css.match(/--vb-fade-span:/g) || []).length, 1);
  });

  it('applique la meme regle a [data-vb-fade] et [data-vb-loop]', () => {
    assert.match(
      css,
      /\[data-vb-fade\],\s*\[data-vb-loop\]\s*\{[^}]*var\(--vb-fade-start\)[^}]*var\(--vb-fade-span\)/s
    );
    assert.doesNotMatch(css, /\[data-vb-fade\]\s*\{\s*opacity:\s*clamp\(0,\s*calc\(\(var\(--vb-scrub/);
  });

  it('neutralise un [data-vb-fade] enfant de [data-vb-loop]', () => {
    assert.match(css, /\[data-vb-loop\]\s+\[data-vb-fade\]\s*\{\s*opacity:\s*1/);
  });

  it('alias data-vb-switch a cote de data-vb-usecase pour active', () => {
    assert.match(css, /\[data-vb-usecase\]\[data-vb-active='true'\],\s*\[data-vb-switch\]\[data-vb-active='true'\]/);
    assert.match(css, /\[data-vb-usecase\]\[data-vb-active='false'\],\s*\[data-vb-switch\]\[data-vb-active='false'\]/);
  });
});
