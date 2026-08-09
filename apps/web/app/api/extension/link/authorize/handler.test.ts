import { describe, expect, it, vi } from 'vitest';

import { handleAuthorize } from './handler';

const REDIRECT_URI = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/zetalog-link';
const STATE = 's'.repeat(32);
const CHALLENGE = 'a'.repeat(43);

function authorizeRequest(extra = ''): Request {
  return new Request(
    `https://www.zetalog.co.uk/api/extension/link/authorize?redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code_challenge=${CHALLENGE}&code_challenge_method=S256&state=${STATE}${extra}`,
  );
}

describe('extension authorize handler', () => {
  it('rejects a non-allowlisted redirect before checking the website session', async () => {
    const signedInUserId = vi.fn(() => Promise.resolve('11111111-1111-4111-8111-111111111111'));
    const createAuthorizationCode = vi.fn();
    const response = await handleAuthorize(
      new Request(
        `https://www.zetalog.co.uk/api/extension/link/authorize?redirect_uri=https%3A%2F%2Fattacker.example&code_challenge=${CHALLENGE}&code_challenge_method=S256&state=${STATE}`,
      ),
      {
        allowedRedirectUris: [REDIRECT_URI],
        signedInUserId,
        createAuthorizationCode,
        consumeUserRateLimit: () => Promise.resolve(true),
      },
    );
    expect(response.status).toBe(400);
    expect(signedInUserId).not.toHaveBeenCalled();
    expect(createAuthorizationCode).not.toHaveBeenCalled();
  });

  it('requires S256 and a state value', async () => {
    const signedInUserId = vi.fn();
    const createAuthorizationCode = vi.fn();
    const plainMethodRequest = new Request(
      authorizeRequest().url.replace('code_challenge_method=S256', 'code_challenge_method=plain'),
    );
    const response = await handleAuthorize(plainMethodRequest, {
      allowedRedirectUris: [REDIRECT_URI],
      signedInUserId,
      createAuthorizationCode,
      consumeUserRateLimit: () => Promise.resolve(true),
    });
    expect(response.status).toBe(400);
    expect(signedInUserId).not.toHaveBeenCalled();
  });

  it('safely resumes the exact local authorize request after sign-in', async () => {
    const response = await handleAuthorize(authorizeRequest(), {
      allowedRedirectUris: [REDIRECT_URI],
      signedInUserId: () => Promise.resolve(null),
      createAuthorizationCode: () => Promise.resolve('unused'),
      consumeUserRateLimit: () => Promise.resolve(true),
    });
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin + location.pathname).toBe('https://www.zetalog.co.uk/signin');
    const next = location.searchParams.get('next');
    expect(next).toContain('/api/extension/link/authorize?');
    expect(next).toContain(`redirect_uri=${encodeURIComponent(REDIRECT_URI)}`);
    expect(next).toContain('code_challenge_method=S256');
  });

  it('binds the signed-in user, challenge, and exact redirect before returning code + state', async () => {
    const createAuthorizationCode = vi.fn(() => Promise.resolve('zla_one_time_code'));
    const response = await handleAuthorize(authorizeRequest(), {
      allowedRedirectUris: [REDIRECT_URI],
      signedInUserId: () => Promise.resolve('11111111-1111-4111-8111-111111111111'),
      createAuthorizationCode,
      consumeUserRateLimit: () => Promise.resolve(true),
    });
    expect(createAuthorizationCode).toHaveBeenCalledWith({
      userId: '11111111-1111-4111-8111-111111111111',
      codeChallenge: CHALLENGE,
      redirectUri: REDIRECT_URI,
    });
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(location.searchParams.get('code')).toBe('zla_one_time_code');
    expect(location.searchParams.get('state')).toBe(STATE);
  });

  it('does not mint codes once the signed-in user reaches the shared hourly limit', async () => {
    const createAuthorizationCode = vi.fn();
    const response = await handleAuthorize(authorizeRequest(), {
      allowedRedirectUris: [REDIRECT_URI],
      signedInUserId: () => Promise.resolve('11111111-1111-4111-8111-111111111111'),
      createAuthorizationCode,
      consumeUserRateLimit: () => Promise.resolve(false),
    });
    expect(response.status).toBe(429);
    expect(createAuthorizationCode).not.toHaveBeenCalled();
  });
});
