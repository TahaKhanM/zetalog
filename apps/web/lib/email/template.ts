import { palette } from '@zetalog/shared';

/**
 * The branded transactional email: a code-only message in the ZetaLog design
 * language (spec §8 as amended by CO-2). Email clients cannot load our fonts
 * or CSS variables, so brand colours are imported from the shared tokens and
 * tints are computed here — no palette hex is hand-written in this module.
 *
 * Deliverability rules this template enforces by construction:
 * - zero links (a sender/link domain mismatch is what got the old magic-link
 *   email quarantined as phishing; a linkless email gives filters nothing),
 * - no images, no scripts, no external requests of any kind,
 * - a hidden preheader so the code shows in inbox preview lines.
 */

/** Blend `hex` toward `base` (CO-2 tint formula), returning a lowercase hex. */
export function mixHex(hex: string, base: string, weight: number): string {
  const channel = (source: string, index: number): number =>
    parseInt(source.slice(1 + index * 2, 3 + index * 2), 16);
  const mixed = [0, 1, 2]
    .map((index) =>
      Math.round(channel(hex, index) * weight + channel(base, index) * (1 - weight))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
  return `#${mixed}`;
}

/** Content slots for one code email. Copy only — the layout is fixed. */
export interface CodeEmailContent {
  readonly heading: string;
  readonly intro: string;
  /** The six-digit code, or a provider placeholder like `{{ .Token }}`. */
  readonly code: string;
  readonly expiryLine: string;
}

const SANS = "'Spline Sans','Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'Azeret Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

/** Render the branded code email as sendable html + plain-text parts. */
export function brandedCodeEmail(content: CodeEmailContent): { html: string; text: string } {
  const surface = mixHex(palette.cream, '#ffffff', 0.3);
  const border = mixHex(palette.cream, '#ffffff', 0.6);
  const chip = mixHex(palette.cream, '#ffffff', 0.12);
  const body = mixHex(palette.navy, '#ffffff', 0.85);
  const meta = mixHex(palette.steelBlue, body, 0.7);
  const hairline = mixHex(palette.navy, '#ffffff', 0.1);

  const pageDark = mixHex(palette.navy, '#000000', 0.72);
  const cardDark = mixHex(palette.navy, '#000000', 0.88);
  const textDark = mixHex(palette.cream, cardDark, 0.9);
  const metaDark = mixHex(palette.steelBlue, textDark, 0.7);
  const borderDark = mixHex(palette.cream, cardDark, 0.14);
  const chipDark = mixHex(palette.cream, cardDark, 0.12);

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
@media (prefers-color-scheme: dark){
.em-page{background:${pageDark}!important}
.em-card{background:${cardDark}!important;border-color:${borderDark}!important}
.em-heading{color:${palette.cream}!important}
.em-body{color:${textDark}!important}
.em-chip{background:${chipDark}!important;border-color:${borderDark}!important}
.em-code{color:${palette.cream}!important}
.em-meta{color:${metaDark}!important}
.em-wordmark{color:${palette.cream}!important}
.em-footer{color:${metaDark}!important;border-color:${borderDark}!important}
}
</style>
</head>
<body class="em-page" style="margin:0;padding:0;background:${surface}">
  <span style="display:none;max-height:0;overflow:hidden">${content.code} &mdash; ${content.expiryLine}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-page" style="background:${surface};padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px">
        <tr><td class="em-wordmark" style="padding:0 4px 14px;font-family:${SANS};font-weight:800;font-size:19px;letter-spacing:.04em;text-transform:uppercase;color:${palette.maroon}">ZetaLog</td></tr>
        <tr><td class="em-card" style="background:#ffffff;border:1px solid ${border};border-radius:14px;padding:28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td class="em-heading" style="font-family:${SANS};font-size:18px;font-weight:600;color:${palette.navy};padding-bottom:8px">${content.heading}</td></tr>
            <tr><td class="em-body" style="font-family:${SANS};font-size:14px;line-height:1.55;color:${body};padding-bottom:22px">${content.intro}</td></tr>
            <tr><td align="center" class="em-chip" style="background:${chip};border:1px solid ${border};border-radius:10px;padding:18px 12px">
              <span class="em-code" style="font-family:${MONO};font-size:38px;font-weight:700;letter-spacing:.28em;color:${palette.navy};font-variant-numeric:tabular-nums">${content.code}</span>
            </td></tr>
            <tr><td class="em-meta" style="font-family:${SANS};font-size:13px;line-height:1.55;color:${meta};padding-top:18px">${content.expiryLine} If you didn't request it, you can safely ignore this email.</td></tr>
          </table>
        </td></tr>
        <tr><td class="em-footer" style="padding:16px 4px 0;border-top:1px solid ${hairline};font-family:${SANS};font-size:12px;color:${meta}">
          Sent by ZetaLog &middot; www.zetalog.co.uk &middot; Not affiliated with Zetamac.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    'ZetaLog',
    '',
    content.heading,
    content.intro,
    '',
    content.code,
    '',
    `${content.expiryLine} If you didn't request it, you can safely ignore this email.`,
    '',
    'Sent by ZetaLog - www.zetalog.co.uk - Not affiliated with Zetamac.',
  ].join('\n');

  return { html, text };
}

/** One dashboard-pasteable Supabase auth template. */
export interface AuthEmailTemplate {
  readonly name: 'Magic Link' | 'Confirm signup';
  readonly subject: string;
  readonly html: string;
}

/**
 * The two Supabase auth email templates (Dashboard → Authentication → Email
 * Templates), rendered from the same branded layout with GoTrue's
 * `{{ .Token }}` placeholder as the code. `docs/ops/auth-email-templates.md`
 * is generated from this function and a test keeps them byte-identical —
 * regenerate the doc whenever the layout changes.
 */
export function authEmailTemplates(): readonly AuthEmailTemplate[] {
  const token = '{{ .Token }}';
  const signIn = brandedCodeEmail({
    heading: 'Your sign-in code',
    intro: 'Enter this code at www.zetalog.co.uk to sign in.',
    code: token,
    expiryLine: 'The code expires in one hour.',
  });
  const signUp = brandedCodeEmail({
    heading: 'Welcome to ZetaLog',
    intro: 'Enter this code at www.zetalog.co.uk to finish creating your account.',
    code: token,
    expiryLine: 'The code expires in one hour.',
  });
  return [
    { name: 'Magic Link', subject: 'Your ZetaLog sign-in code: {{ .Token }}', html: signIn.html },
    {
      name: 'Confirm signup',
      subject: 'Your ZetaLog sign-up code: {{ .Token }}',
      html: signUp.html,
    },
  ];
}
