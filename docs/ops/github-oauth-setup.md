# Authentication dashboard runbook

Owner actions required to activate password sign-in, GitHub login and recovery
emails on the hosted project. The code is live as soon as these are complete;
nothing here is optional.

> **Paste the generated email templates first.** The authentication release
> updates every template and adds **Reset Password**. The recovery flow cannot deliver a
> code until it is pasted. Every subject and body lives in
> [`auth-email-templates.md`](./auth-email-templates.md) (generated,
> byte-sync-tested against `apps/web/lib/email/template.ts`).

## 1. Email templates (Dashboard → Authentication → Email Templates)

For each of **Magic Link**, **Confirm signup**, and **Reset Password**:

1. Open the template, paste the **Subject** and **Message HTML** exactly as
   they appear in `docs/ops/auth-email-templates.md`. No edits — the HTML is
   deliberately linkless (deliverability) and code-only.
2. Save.

The local stack already renders these exact bytes from
`supabase/templates/*.html`, so what you tested locally is what ships.

## 2. Password settings (Dashboard → Authentication → Providers → Email)

- **Enable Sign in with Email** stays on.
- **Confirm email**: **ON** — sign-up must require the emailed code before a
  session exists (the form calls `verifyOtp({ type: 'signup' })`).
- **Minimum password length**: **10** — must match `MIN_PASSWORD_LENGTH` in
  `apps/web/lib/password.ts` and `minimum_password_length` in
  `supabase/config.toml`. The form enforces 10 client-side; GoTrue is the
  authority.
- (Recommended) **Prevent use of leaked passwords** if the plan allows it —
  it composes with the app's small embedded common-password list.

## 3. GitHub OAuth app (github.com)

1. GitHub → Settings → Developer settings → **OAuth Apps** → _New OAuth App_
   (create it on the account/org that owns the ZetaLog repo).
2. Fill in:
   - **Application name**: `ZetaLog`
   - **Homepage URL**: `https://www.zetalog.co.uk`
   - **Authorization callback URL** — the SUPABASE callback, not the site:
     `https://<project-ref>.supabase.co/auth/v1/callback`
     (shown verbatim under Dashboard → Authentication → Providers → GitHub).
3. Register, then create a **client secret**. Note the Client ID and secret;
   store the secret only in a password manager — never in the repo.

## 4. Enable the GitHub provider (Dashboard → Authentication → Providers)

1. Open **GitHub**, toggle it on.
2. Paste the OAuth app's **Client ID** and **Client secret**. Save.
3. Google remains configured as before — no change needed.

## 5. URL configuration sanity check (Dashboard → Authentication → URL Configuration)

GitHub round-trips through the same `/auth/callback` route, so confirm:

- **Site URL** = deployed web origin,
- **Redirect URLs** include the deployed `/auth/callback` and preview deployments.
  The extension's Chrome Identity callback is not a Supabase Auth redirect. After
  the Chrome Web Store assigns the extension ID, configure its exact
  `https://<extension-id>.chromiumapp.org/zetalog-link` value in the web server's
  `EXTENSION_OAUTH_REDIRECT_URIS` environment variable instead.

## 6. Database migration

`supabase db push` applies `20260721120000_alias_login_integrity.sql`
(verified-alias unique index + the `auth_identifier_lookup` function the
lookup/login routes call). The routes 500 without it — deploy the migration
before or with the web release.

## Smoke test after the dashboard work

1. `/signin` → new email → password + confirm → code arrives (branded, no
   links) → account created and signed in.
2. Sign out → same email + password signs in with **no code**.
3. "Continue with GitHub" completes and lands back signed in.
4. "Forgot password?" delivers the Reset Password email and the new password
   signs in.
5. An OTP-era account (no password) is routed through "finish setting up your
   password" on its first visit.
