import { describe, expect, it } from 'vitest';

import { isCompleteCode, normaliseCode, signInErrorMessage } from './signin';

describe('normaliseCode', () => {
  it('strips spaces and non-digits from pasted codes', () => {
    expect(normaliseCode('123 456')).toBe('123456');
    expect(normaliseCode(' 12-34 56\n')).toBe('123456');
  });

  it('caps input at six digits', () => {
    expect(normaliseCode('1234567890')).toBe('123456');
  });

  it('passes through a clean code unchanged', () => {
    expect(normaliseCode('000000')).toBe('000000');
  });
});

describe('isCompleteCode', () => {
  it('accepts exactly six digits', () => {
    expect(isCompleteCode('123456')).toBe(true);
  });

  it.each(['', '12345', '1234567', '12345a'])('rejects %j', (code) => {
    expect(isCompleteCode(code)).toBe(false);
  });
});

describe('signInErrorMessage', () => {
  it('maps a rate-limited send to a wait message', () => {
    expect(signInErrorMessage('send', { status: 429 })).toBe(
      'Too many attempts — wait a minute, then try again.',
    );
  });

  it('maps a failed send to address guidance', () => {
    expect(signInErrorMessage('send', { message: 'Error sending confirmation email' })).toBe(
      'Could not send the code. Check the address and try again.',
    );
  });

  it('maps an expired or invalid code to a resend hint', () => {
    expect(signInErrorMessage('verify', { message: 'Token has expired or is invalid' })).toBe(
      'That code is wrong or has expired. Check it, or send a new one.',
    );
  });

  it('maps a rate-limited verify to a wait message', () => {
    expect(signInErrorMessage('verify', { status: 429 })).toBe(
      'Too many attempts — wait a minute, then try again.',
    );
  });

  it('falls back to a generic verify message and never echoes raw server text', () => {
    const message = signInErrorMessage('verify', { message: 'pq: deadlock detected 0x1f' });
    expect(message).toBe('Could not verify the code. Please try again.');
    expect(message).not.toContain('deadlock');
  });
});
