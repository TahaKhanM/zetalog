import { describe, expect, it } from 'vitest';

import { supabaseCookieName } from './browser';

describe('Supabase browser proxy compatibility', () => {
  it('keeps the project-ref cookie name used by direct browser clients', () => {
    expect(supabaseCookieName('https://jnhalsnndqqowyoinbrz.supabase.co')).toBe(
      'sb-jnhalsnndqqowyoinbrz-auth-token',
    );
  });
});
