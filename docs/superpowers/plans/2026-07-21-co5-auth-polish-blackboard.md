# CO-5: Auth truthfulness, handle names, and the steel blackboard

**Source:** product-owner feedback after CO-4: sign-up path invisible from the sign-in
card; leaderboard numerals unstructured; subtitle too corporate; password copy said 10
while GoTrue enforces 8; usernames should be spaceless and capped; account page should
show connected emails and offer password changes; the logo sank into the cream; the
header read as plain text; maroon is illegible on the dark theme.

Palette hexes and font roles unchanged. Supersedes earlier rules only as stated.

## 1. Theme-aware accent (the big rule change)

Maroon remains the ink of authority **on paper only**. The blackboard bans maroon
entirely: semantic `--accent*` variables resolve maroon on light and **steel** on dark,
and every accent role (primary buttons, notices, quarantine chips, weak-spot callouts,
slowest markers, strength meter, avatar monogram, nav underlines) uses them. Dark
surfaces deepen to a true navy (page `navy 72% → black`, cards 84%) with steel ruling
replacing cream hairlines; display ink stays cream.

## 2. Header and identity

- The site header carries the exam-paper's strong rule (2px) and an index nav: small
  accent numerals (`01`, `02`) before quiet titles; active link inks its numeral.
- The signed-in chip is a pill with a monogram avatar + display name → `/account`;
  signed out, a compact primary Sign in button.
- The brand mark sits on a small white tile (border + shadow) so it reads on both the
  cream paper and the blackboard.

## 3. Boards

- One numeral discipline per column: rank 0.9rem/500 (top-3 accent 700), games
  0.92rem/400, best 1.05rem/700 — all tabular, right-aligned, fixed gutters.
- Subtitle copy is plain: "Everyone's best scores from real games — each one checked
  before it counts."

## 4. Auth flows

- Card title: "Sign in or sign up", with the branch labelled in Archivo step headers:
  "Welcome back" (password) vs "New here — create your account" (sign-up).
- Password minimum is **8** everywhere (lib, hints, config.toml), matching the live
  GoTrue setting; the common-password list gains the 8–9-char classics.
- Display names are handles: `^[A-Za-z0-9_]{3,15}$`, no spaces. DB CHECK replaced
  (NOT VALID — legacy spaced names persist read-only until changed).
- `/account` gains Sign-in & security: primary email, verified uni alias (it also signs
  you in), provider chips, and a code-based change/set-password flow on the same
  recovery rails as `/signin` (inbox control, no current-password theatre).
- Google consent-screen branding is an owner dashboard task —
  `docs/ops/google-oauth-branding.md` is the runbook (app name + custom auth domain).

## 5. Linking audit (statement of record)

Email↔OAuth linking is sound: GoTrue auto-links a Google sign-in to an existing
verified-email account; `classifyLookup` sends password-holders to password sign-in
regardless of linked providers, steers passwordless OAuth accounts to their provider
button (with "set a password instead"), and routes OTP-era accounts through recovery
setup. A Google-first user who later sets a password keeps one account with both
methods, and the account page now shows exactly that.
