import { describe, expect, it } from 'vitest';

import { color, palette, typography } from './tokens.js';

const HEX_COLOR = /^#[0-9a-f]{6}$/;

describe('palette', () => {
  it('contains only lowercase six-digit hex colours', () => {
    for (const value of Object.values(palette)) {
      expect(value).toMatch(HEX_COLOR);
    }
  });

  it('matches the five colours fixed by the design spec', () => {
    expect(Object.values(palette).sort()).toEqual(
      ['#780000', '#c1121f', '#fdf0d5', '#003049', '#669bbc'].sort(),
    );
  });
});

describe('color roles', () => {
  it('reserves red exclusively for new PBs and destructive actions', () => {
    const redRoles = Object.entries(color)
      .filter(([, value]) => value === palette.red)
      .map(([role]) => role);
    expect(redRoles.sort()).toEqual(['destructive', 'newPersonalBest']);
  });

  it('inverts background and text between light and dark modes', () => {
    expect(color.light.background).toBe(color.dark.text);
    expect(color.light.text).toBe(color.dark.background);
  });
});

describe('typography', () => {
  it('keeps the display face inside the spec weight range 800-900', () => {
    expect(typography.display.weightMin).toBeGreaterThanOrEqual(800);
    expect(typography.display.weightMax).toBeLessThanOrEqual(900);
    expect(typography.display.weightMin).toBeLessThanOrEqual(typography.display.weightMax);
  });

  it('renders all numerals tabular', () => {
    expect(typography.numeric.fontVariantNumeric).toBe('tabular-nums');
  });
});
