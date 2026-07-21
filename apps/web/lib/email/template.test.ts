import { describe, expect, it } from 'vitest';

import { palette } from '@zetalog/shared';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { authEmailTemplates, brandedCodeEmail, mixHex } from './template';

const sample = brandedCodeEmail({
  heading: 'Your sign-in code',
  intro: 'Enter this code at www.zetalog.co.uk to sign in.',
  code: '123456',
  expiryLine: 'The code expires in 15 minutes.',
});

describe('mixHex', () => {
  it('mixes toward white like the CO-2 surface formula', () => {
    expect(mixHex(palette.cream, '#ffffff', 0.3)).toBe('#fefbf2');
  });

  it('returns the colour unchanged at full weight', () => {
    expect(mixHex(palette.navy, '#ffffff', 1)).toBe(palette.navy);
  });
});

describe('brandedCodeEmail', () => {
  it('shows the code as the hero in both html and text', () => {
    expect(sample.html).toContain('123456');
    expect(sample.text).toContain('123456');
  });

  it('contains no links at all — nothing for mail filters to flag', () => {
    expect(sample.html).not.toMatch(/<a[\s>]/i);
    expect(sample.html).not.toContain('href');
    expect(sample.html).not.toMatch(/https?:\/\//);
  });

  it('carries the brand: maroon wordmark and navy text from the shared palette', () => {
    expect(sample.html).toContain('ZetaLog');
    expect(sample.html).toContain(palette.maroon);
    expect(sample.html).toContain(palette.navy);
  });

  it('uses desaturated CO-2 surfaces, not solid brand fills', () => {
    expect(sample.html).toContain(mixHex(palette.cream, '#ffffff', 0.3));
    expect(sample.html).not.toMatch(new RegExp(`background[^;"]*:${palette.maroon}`));
  });

  it('renders the intro and expiry copy', () => {
    expect(sample.html).toContain('Enter this code');
    expect(sample.html).toContain('expires in 15 minutes');
    expect(sample.text).toContain('expires in 15 minutes');
  });

  it('hides a preheader carrying the code for inbox preview lines', () => {
    expect(sample.html).toMatch(/display:none[^>]*>[^<]*123456/);
  });
});

describe('authEmailTemplates', () => {
  const doc = readFileSync(
    join(import.meta.dirname, '../../../../docs/ops/auth-email-templates.md'),
    'utf8',
  );

  it.each(authEmailTemplates())('docs/ops copy of "$name" is byte-identical to the code', (t) => {
    expect(doc).toContain(t.subject);
    expect(doc).toContain(t.html);
  });

  it('keeps the GoTrue token placeholder and the no-link rule', () => {
    for (const t of authEmailTemplates()) {
      expect(t.html).toContain('{{ .Token }}');
      expect(t.html).not.toMatch(/<a[\s>]/i);
    }
  });
});
