import { describe, expect, it } from 'vitest';

import { displayNameSchema, isValidDisplayName } from './profile';

describe('isValidDisplayName', () => {
  it('accepts 3–15 chars of letters, digits, and underscore', () => {
    for (const name of ['ada', 'Ada_99', 'quant_king', 'x'.repeat(15)]) {
      expect(isValidDisplayName(name)).toBe(true);
    }
  });

  it('rejects names that are too short or too long', () => {
    expect(isValidDisplayName('ab')).toBe(false);
    expect(isValidDisplayName('x'.repeat(16))).toBe(false);
  });

  it('rejects spaces anywhere in the name', () => {
    expect(isValidDisplayName('A B')).toBe(false);
    expect(isValidDisplayName(' ada')).toBe(false);
    expect(isValidDisplayName('ada ')).toBe(false);
    expect(isValidDisplayName('   ')).toBe(false);
  });

  it('rejects disallowed characters', () => {
    expect(isValidDisplayName('bad!')).toBe(false);
    expect(isValidDisplayName('emoji🙂x')).toBe(false);
    expect(isValidDisplayName('dash-name')).toBe(false);
  });
});

describe('displayNameSchema', () => {
  it('parses a valid name', () => {
    expect(displayNameSchema.parse('quant_king')).toBe('quant_king');
  });

  it('throws on an invalid name', () => {
    expect(() => displayNameSchema.parse('no')).toThrow();
    expect(() => displayNameSchema.parse('has space')).toThrow();
  });
});
