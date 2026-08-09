# ZetaLog — Chrome Web Store submission

Single source of truth for publishing the ZetaLog extension. Store-listing copy
lives in `docs/store/listing.md`; the privacy policy is at
`docs/store/privacy-policy.md` and served live at
https://www.zetalog.co.uk/privacy.

The mandatory automated gates, owner/account setup, database preflight,
monitoring thresholds, and rollback procedure are in
`docs/ops/release-readiness.md`. Complete that runbook in order; this document
contains the Store-specific copy and dashboard sequence.

Last updated: 6 August 2026 · Release train: initial public release

The initial Chrome Web Store package is version **1.0.0**. Chrome does not allow
the same version to be uploaded twice, so first confirm that no `1.0.0` package
has previously been uploaded to the Web Store dashboard. If it has, stop and
choose a higher version before generating any release artifact.

## Build the package locally

From the repo root:

```bash
pnpm --filter @zetalog/extension zip
```

Output: `apps/extension/.output/zetalogextension-<version>-chrome.zip`. WXT builds
in production mode, which strips the `localhost` content-script match, and its
ZIP excludes source, tests and configs. This local build is a preflight only.
Upload the exact ZIP retained by the protected `release-artifact` CI job, never a
later local rebuild.

## Readiness audit

Re-run these checks against the exact `chrome-mv3` manifest and zip to publish.

| Check                                                                    | Status                             |
| ------------------------------------------------------------------------ | ---------------------------------- |
| Manifest V3, no V2 APIs                                                  | Pass                               |
| Version matches `apps/extension/package.json`                            | Pass (1.0.0)                       |
| Name matches listing ("ZetaLog")                                         | Pass                               |
| Description ≤ 132 chars, no fluff                                        | Pass (69 chars)                    |
| Icons: 16/32/48/96/128 all present, real PNGs                            | Pass                               |
| Permissions minimal: `storage`, `alarms`, `unlimitedStorage`, `identity` | Pass (no warning permissions)      |
| Minimum Chrome version: 116 (MV3 identity-flow keepalive)                | Pass                               |
| No `<all_urls>`; host access via content-script matches only             | Pass                               |
| Production build strips `localhost` match                                | Pass (0 localhost in zip manifest) |
| No remote code; all JS bundled                                           | Pass                               |
| No dev-file leaks in zip (.map, .ts, tests, .env, node_modules)          | Pass                               |
| Privacy policy live at a stable URL                                      | Pass (/privacy)                    |
| Single-purpose statement written                                         | Pass                               |
| Per-permission justifications written                                    | Pass (listing.md)                  |
| Data-use disclosure mapped                                               | Pass (listing.md)                  |
| Content script only on zetamac.com + zetalog.co.uk/link                  | Pass                               |
| Popup loads without console errors                                       | Pass (verified in preview)         |
| Uninstall clean (all state in chrome.storage.local)                      | Pass                               |

### Manual, done at submission (cannot be automated here)

- [ ] Load the unpacked `chrome-mv3` build in Chrome and play a real Zetamac game;
      confirm the popup fills and the link flow reaches "Linked".
- [ ] Install into a clean Chrome 116+ profile; confirm the extension opens `/link`, then
      starts Chrome Identity only after one trusted Link click. No page refresh is needed.
- [ ] Exercise a same-ID legacy fixture with a still-valid session; confirm it
      silently migrates to its installation credential with no relink prompt.
- [ ] Test a deliberately broken legacy session; confirm it asks for one relink, starts only
      after the explicit Link action, and does not expose a website session token or PKCE verifier.
- [ ] Verify the approved unpacked-beta instructions in
      `docs/ops/release-readiness.md`. A different-ID Store installation cannot
      read the beta extension's local storage or silently replace it.
- [ ] Play an otherwise eligible game while offline, reconnect, and confirm it is submitted and
      evaluated under the normal leaderboard rules.
- [ ] Capture the five screenshots listed in `docs/store/listing.md` at 1280×800.
- [ ] Store icon: use `Assets/icons/icon-128.png` (128×128, no transparency issues).
- [ ] Optional small promo tile 440×280.
- [ ] Confirm https://www.zetalog.co.uk/privacy loads before submitting.

## Dashboard steps

1. chromewebstore.google.com/devconsole, pay the one-time developer fee if this
   is the first extension on the account.
2. New item, upload the zip and save it as a draft. Copy the permanent extension
   ID Chrome assigns; do not submit the item yet.
3. Store listing tab: name, category (Productivity), short + detailed description,
   screenshots, store icon. Copy from `docs/store/listing.md`.
4. Privacy practices tab: single-purpose statement, one justification per
   permission and per host, and the data-use disclosure. Copy from `listing.md`.
5. Privacy policy URL: https://www.zetalog.co.uk/privacy.
6. Complete the production rollout and callback checks below, then return to
   the dashboard and submit the saved item for review with **deferred
   publishing** selected. This prevents approval from publishing before the
   final release check.

## Production rollout order

Do not publish the extension before its server-side support is live. Use this
order so current installations continue to work throughout the migration:

1. Create or upload the Chrome Web Store item as a draft. After Chrome assigns
   its permanent extension ID, derive the exact callback URL:
   `https://<extension-id>.chromiumapp.org/zetalog-link`.
2. Set `EXTENSION_OAUTH_REDIRECT_URIS` to that exact URL in the staging and
   production web environments. Do not use a wildcard and do not add this URL
   to Supabase Auth Redirect URLs. Never add an unpacked build's path-derived ID
   or a wildcard to the production allowlist.
3. Set `NEXT_PUBLIC_CHROME_WEB_STORE_URL` in staging to the final listing URL.
   Prepare the equivalent production website deployment, but do not promote it
   while the listing is private.
4. In the Supabase dashboard, enable the Cron integration (`pg_cron`) for the
   production project before applying the scheduled-retention migration.
5. Apply all three `20260806` migrations to staging, run the database/pgTAP
   suite, and exercise link, submit, restore, deletion, and retention paths.
6. Confirm the scheduled `zetalog-operational-data-retention` job exists and
   successfully runs `public.purge_expired_operational_data()`.
7. Apply the validated migrations to production, then deploy the website and
   API with `EXTENSION_OAUTH_REDIRECT_URIS` configured. Verify both legacy
   migration and Chrome Identity/PKCE linking before moving on.
8. Submit extension 1.0.0 for review with deferred publishing. While it is in
   review, repeat the manual checks above on the exact uploaded ZIP; once it is
   approved and staged, confirm the staged version and package are unchanged.
9. Publish extension 1.0.0. Confirm the public listing is installable in a clean,
   signed-out profile, then promote the prepared website deployment and beta-user
   announcement.
10. Monitor authentication failures, queued uploads, storage failures and the
    beta-to-Store transition without retaining identifiable event payloads.
    Before 4 November 2026 UTC, complete the communicated transition for unpacked
    beta installations. Remove the legacy compatibility code in the following
    normal website release.

## Known post-publish follow-ups

- The extension config (`apps/extension/lib/config.ts`) already points at the
  production site and the real Supabase URL and anon key. No secrets ship (the
  anon key is public by design; RLS is the security boundary).
- The extension uses the warning-free `chrome.identity` permission for a
  browser-owned PKCE redirect. Chrome 116 or later is required because it keeps
  the Manifest V3 worker alive for that redirect. Website sign-in happens on the
  website; the extension retains the PKCE verifier, exchanges the callback code
  directly with ZetaLog, and stores only an independent revocable credential.
  Website tokens never cross the page.
- After the store ID is assigned, the production
  `NEXT_PUBLIC_CHROME_WEB_STORE_URL` value must point `/how-it-works` at the Store
  listing. Do not publish while the page still shows "Load unpacked".

## Initial-release notes

Include the following in the Chrome Web Store "What's new" text for this
release:

> Improved account-link security. Linking now uses a private browser-owned
> redirect; your website session is not shared through the page. Existing beta
> users install the Store version and link it once. Eligible games recorded
> offline can sync and be considered for the leaderboard when you reconnect.

Silent migration from a still-valid legacy session is accepted only through
**3 November 2026** and is server-refused from **4 November 2026 UTC**. Raw
session handoff through the link page has been removed already. Different-ID
unpacked beta users follow the explicit one-time transition communication in the
release runbook.

## Version history

- **1.0.0** (release candidate, 2026-08-06): initial Chrome Web Store release.
  Includes the score recorder and leaderboard, independent extension
  credentials, browser-owned PKCE linking, silent migration of valid legacy
  sessions, offline-eligible ranking, and the legacy-compatibility sunset plan.
