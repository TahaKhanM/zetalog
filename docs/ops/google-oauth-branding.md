# Making Google's consent screen say ZetaLog, not supabase.co

The "Choose an account — to continue to jnhalsnndqqowyoinbrz.supabase.co" line shows the
domain of the OAuth **redirect URI**, which today is the Supabase project's default auth
domain. Two owner-dashboard steps fix the branding; the second one replaces the domain
itself.

## Step 1 — App name and branding (free, 5 minutes, partial fix)

Google Cloud Console → APIs & Services → **OAuth consent screen** (the project that holds
the ZetaLog OAuth client):

1. **App name**: `ZetaLog`.
2. **User support email**: your address.
3. **App logo**: upload `Assets/icons/icon-512.png` (Google may require verification
   review once a logo is set).
4. **App domain / Authorized domains**: add `zetalog.co.uk`.

After this the screen says "Choose an account to continue to **ZetaLog**" in the title
area — but the small print still shows the supabase.co redirect domain.

## Step 2 — Custom auth domain (removes supabase.co entirely)

Supabase's **Custom Domains** add-on serves the auth endpoints from your own hostname:

1. Supabase dashboard → Project Settings → **Custom Domains** → activate
   `auth.zetalog.co.uk` (the add-on is a paid feature on the Pro plan).
2. Add the DNS records Supabase shows (a CNAME from `auth.zetalog.co.uk` to
   `jnhalsnndqqowyoinbrz.supabase.co` plus TXT validation records) wherever
   `zetalog.co.uk` DNS is managed. Wait for the dashboard to confirm activation.
3. Google Cloud Console → Credentials → the OAuth 2.0 client → **Authorized redirect
   URIs**: add `https://auth.zetalog.co.uk/auth/v1/callback` (keep the old supabase.co
   URI until the switch is confirmed, then remove it).
4. Supabase dashboard → Authentication → Providers → Google: no change needed — the
   callback shown there updates to the custom domain automatically once active.
5. Update the app env everywhere (`NEXT_PUBLIC_SUPABASE_URL` in Vercel and local
   `.env.local` files, and the extension's baked URL if it embeds one) to
   `https://auth.zetalog.co.uk`? **No** — leave the API URL as is; only auth traffic
   moves. Supabase serves both on the custom domain, so switching
   `NEXT_PUBLIC_SUPABASE_URL` to the custom domain is optional but recommended for
   consistency once active.

After activation the consent screen reads "to continue to **auth.zetalog.co.uk**", and
with Step 1's app name it leads with **ZetaLog**.

## Why the app cannot do this itself

Both steps live in owner-only dashboards (Google Cloud, Supabase billing, DNS). Nothing
in this repo changes; this document is the runbook.
