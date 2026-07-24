/**
 * Pure password policy + strength hinting for the auth flows (sign-up and
 * recovery). No dependencies, no I/O, and — deliberately — no logging: a
 * password value must never reach a log, error detail, test snapshot, or
 * telemetry event anywhere in this codebase.
 *
 * Policy: at least {@link MIN_PASSWORD_LENGTH} characters and not in the small
 * embedded common-password list. The list only carries entries the length gate
 * cannot already reject (≥ 8 chars), which keeps it tiny with zero loss of
 * coverage — a deliberate no-new-dependencies trade-off versus shipping a
 * full breach corpus.
 */

/** Minimum password length — MUST match the GoTrue dashboard setting (8). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Frequently-used passwords of ≥ 8 characters (top entries of public breach
 * corpora, keyboard walks, and pop-culture staples), stored lowercase for
 * case-insensitive lookup. Shorter favourites ("123456", "qwerty") are
 * already unrepresentable under the length gate.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  // 8–9 characters — representable since the minimum dropped to 8.
  'password',
  'password1',
  'password!',
  'passw0rd',
  'p@ssw0rd',
  '12345678',
  '123456789',
  '87654321',
  '11111111',
  '00000000',
  'qwerty12',
  'qwerty123',
  'qwertyui',
  'asdfghjk',
  'zxcvbnm1',
  '1q2w3e4r',
  'iloveyou',
  'iloveyou1',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'superman',
  'batman123',
  'trustno1',
  'letmein1',
  'welcome1',
  'monkey12',
  'dragon12',
  'starwars',
  'pokemon1',
  'liverpool',
  'chelsea1',
  'arsenal1',
  'computer',
  'internet',
  'whatever',
  'chocolate',
  'abcd1234',
  'abc12345',
  'a1b2c3d4',
  '1234567890',
  '12345678910',
  '123456789012',
  '0123456789',
  '1234554321',
  '1qaz2wsx3edc',
  '1q2w3e4r5t',
  '1q2w3e4r5t6y',
  'qwertyuiop',
  'qwertyuiop123',
  'qwerty123456',
  'qwer1234qwer',
  'asdfghjkl;',
  'asdfghjkl123',
  'zxcvbnm123',
  'password12',
  'password123',
  'password1234',
  'password12345',
  'password123456',
  'password!23',
  'passw0rd123',
  'p@ssw0rd123',
  'mypassword',
  'mypassword1',
  'mypassword123',
  'newpassword',
  'newpassword1',
  'changeme123',
  'letmein12345',
  'welcome12345',
  'welcome123456',
  'iloveyou12',
  'iloveyou123',
  'iloveyou1234',
  'sunshine123',
  'princess123',
  'football123',
  'liverpool1',
  'manchester1',
  'basketball',
  'superman123',
  'spiderman123',
  'metallica1',
  'rushyrushy',
  'whatever123',
  'trustno1trustno1',
  'dragon123456',
  'monkey123456',
  'computer123',
  'internet123',
  'chocolate1',
  'jesuschrist',
  'aaaaaaaaaa',
  '1111111111',
  '0000000000',
  'abc123abc123',
  'abcd1234abcd',
  'a1b2c3d4e5',
  '9876543210',
  '987654321098',
]);

/** Result of {@link checkPassword} — a typed value, never an exception. */
export type PasswordCheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: 'too-short' | 'common' };

/** Adjudicate a candidate password against the policy. Length gates first. */
export function checkPassword(password: string): PasswordCheck {
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: 'too-short' };
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return { ok: false, reason: 'common' };
  return { ok: true };
}

/** Live strength hint for the sign-up form's meter. */
export interface PasswordStrength {
  /** 0 = fails policy, 1–3 = fair/good/strong. */
  readonly score: 0 | 1 | 2 | 3;
  readonly label: 'Too short' | 'Too common' | 'Fair' | 'Good' | 'Strong';
}

/** Count of distinct character classes (lower, upper, digit, other) present. */
function characterClasses(password: string): number {
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/\d/.test(password)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(password)) classes += 1;
  return classes;
}

/**
 * Score a candidate for the live meter. A policy failure is always score 0
 * with the failure named; passing passwords climb with length and character
 * variety. Purely heuristic — the policy above is the only hard gate.
 */
export function passwordStrength(password: string): PasswordStrength {
  const policy = checkPassword(password);
  if (!policy.ok) {
    return { score: 0, label: policy.reason === 'too-short' ? 'Too short' : 'Too common' };
  }
  let score: 1 | 2 | 3 = 1;
  if (password.length >= 14) score = 2;
  if (characterClasses(password) >= 3 && password.length >= 12) {
    score = score === 2 ? 3 : 2;
  }
  const label = score === 1 ? 'Fair' : score === 2 ? 'Good' : 'Strong';
  return { score, label };
}
