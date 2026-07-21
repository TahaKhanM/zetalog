import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { palette } from '@zetalog/shared';
import { describe, expect, it } from 'vitest';

/**
 * Single-source-of-truth enforcement (brief + CO-2 §3): globals.css must define
 * the five brand hexes exactly as packages/shared/src/tokens.ts declares them,
 * and it must contain NO other 6-digit hex literal — every tint is a color-mix
 * over these variables, so a stray hex means someone hard-coded a colour.
 */
const cssPath = fileURLToPath(new URL('../app/globals.css', import.meta.url));
const css = readFileSync(cssPath, 'utf8');

const brandHexes = new Set(Object.values(palette).map((hex) => hex.toLowerCase()));

describe('globals.css ↔ shared tokens', () => {
  it('declares every shared palette hex verbatim', () => {
    for (const hex of brandHexes) {
      expect(css.toLowerCase()).toContain(hex);
    }
  });

  it('binds each hex to its expected --color-zl-* variable', () => {
    const bindings: Record<string, string> = {
      '--color-zl-maroon': palette.maroon,
      '--color-zl-red': palette.red,
      '--color-zl-cream': palette.cream,
      '--color-zl-navy': palette.navy,
      '--color-zl-steel': palette.steelBlue,
    };
    for (const [variable, hex] of Object.entries(bindings)) {
      expect(css).toContain(`${variable}: ${hex}`);
    }
  });

  it('contains no 6-digit hex literal other than the five brand colours', () => {
    const found = (css.toLowerCase().match(/#[0-9a-f]{6}\b/g) ?? []).map((hex) => hex);
    const strays = [...new Set(found)].filter((hex) => !brandHexes.has(hex));
    expect(strays).toEqual([]);
  });
});
