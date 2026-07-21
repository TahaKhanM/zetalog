import { describe, expect, it } from 'vitest';

import { displayNameSchema, isValidDisplayName } from './profile';

describe('isValidDisplayName', () => {
  it('accepts 3–20 chars of letters, digits, underscore, and internal spaces', () => {
    for (const name of ['ada', 'Ada_99', 'A B C', 'x'.repeat(20)]) {
      expect(isValidDisplayName(name)).toBe(true);
    }
  });

  it('rejects names that are too short or too long', () => {
    expect(isValidDisplayName('ab')).toBe(false);
    expect(isValidDisplayName('x'.repeat(21))).toBe(false);
  });

  it('rejects leading or trailing spaces and whitespace-only names', () => {
    expect(isValidDisplayName(' ada')).toBe(false);
    expect(isValidDisplayName('ada ')).toBe(false);
    expect(isValidDisplayName('   ')).toBe(false);
  });

  it('rejects disallowed characters', () => {
    expect(isValidDisplayName('bad!')).toBe(false);
    expect(isValidDisplayName('emoji🙂x')).toBe(false);
  });
});

describe('displayNameSchema', () => {
  it('parses a valid name', () => {
    expect(displayNameSchema.parse('quant_king')).toBe('quant_king');
  });

  it('throws on an invalid name', () => {
    expect(() => displayNameSchema.parse('no')).toThrow();
  });
});
