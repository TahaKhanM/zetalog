import { describe, expect, it } from 'vitest';

import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('preserves an in-app path, query, and hash', () => {
    expect(safeNext('/link?source=popup#handoff')).toBe('/link?source=popup#handoff');
  });

  it.each(['//attacker.example', '/\\attacker.example', 'https://attacker.example', 'me'])(
    'rejects an external or relative target: %s',
    (value) => {
      expect(safeNext(value)).toBe('/me');
    },
  );

  it('uses the requested fallback when no target is supplied', () => {
    expect(safeNext(undefined, '/link')).toBe('/link');
  });
});
