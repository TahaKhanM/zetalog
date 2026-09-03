# ZetaLog — Chrome Web Store submission

Single source of truth for publishing the ZetaLog extension. Store-listing copy
lives in `docs/store/listing.md`; the privacy policy is at
`docs/store/privacy-policy.md` and served live at
https://www.zetalog.co.uk/privacy.

The mandatory automated gates, owner/account setup, database preflight,
monitoring thresholds, and rollback procedure are in
`docs/ops/release-readiness.md`. Complete that runbook in order; this document
contains the Store-specific copy and dashboard sequence.

Last updated: 2 September 2026 · Release train: 1.0.1 update

The production Chrome Web Store item is `bjleafpcpockiiblhkoddgomhkloaiab`.
Chrome does not allow the same version to be uploaded twice. Before generating
any release artifact, confirm the next version in the dashboard and choose a
higher version everywhere if that package has already been uploaded.

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
| Version matches `apps/extension/package.json`                            | Pass (1.0.1)                       |
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

1. chromewebstore.google.com/devconsole, open the existing **ZetaLog** item
   (`bjleafpcpockiiblhkoddgomhkloaiab`). Do not create a new item; a new item
   gets a new extension ID and breaks the configured link callback.
2. Package tab: upload the 1.0.1 zip from the retained CI artifact and save it
   as a draft. Do not submit yet.
3. Store listing tab: refresh the short + detailed description, screenshots and
   store icon if they changed. Copy from `docs/store/listing.md`. The category
   is Education.
4. Privacy practices tab: re-check the single-purpose statement, the
   justification per permission and per host, and the data-use disclosure
   against `listing.md`.
5. Privacy policy URL: https://www.zetalog.co.uk/privacy.
6. Complete the production checks below, then return to the dashboard and
   submit the draft for review with **deferred publishing** selected. This
   prevents approval from publishing before the final release check.

## Production rollout order

The 1.0.0 server-side support is already live. For the 1.0.1 update:

1. Confirm `EXTENSION_OAUTH_REDIRECT_URIS` in production is exactly
   `https://bjleafpcpockiiblhkoddgomhkloaiab.chromiumapp.org/zetalog-link`.
   `GET /api/extension/link/status` must return 200 for that redirect URI; a
   409 means the allowlist is wrong and the Link button will fail closed.
   Do not use a wildcard and do not add this URL to Supabase Auth Redirect URLs.
2. Confirm the scheduled `zetalog-operational-data-retention` job still exists
   and successfully runs `public.purge_expired_operational_data()`.
3. Deploy any website/API changes from this release train first and verify
   sign-in, link, submit, restore and deletion against the live 1.0.0
   extension. The API must stay compatible with 1.0.0 until 1.0.1 has rolled
   out to installations.
4. Submit extension 1.0.1 for review with deferred publishing. While it is in
   review, repeat the manual checks above on the exact uploaded ZIP; once it is
   approved and staged, confirm the staged version and package are unchanged.
5. Publish extension 1.0.1. Chrome auto-updates existing Store installations.
   Confirm the listing shows 1.0.1 and that a clean, signed-out profile can
   install, link and sync.
6. Monitor authentication failures, queued uploads and storage failures without
   retaining identifiable event payloads. Before 4 November 2026 UTC, complete
   the communicated transition for unpacked beta installations. Remove the
   legacy compatibility code in the following normal website release.

## Known post-publish follow-ups

- The extension endpoints (`apps/extension/lib/endpoints.ts`) already point at the
  production site and the real Supabase URL and anon key. No secrets ship (the
  anon key is public by design; RLS is the security boundary).
- The extension uses the warning-free `chrome.identity` permission for a
  browser-owned PKCE redirect. Chrome 116 or later is required because it keeps
  the Manifest V3 worker alive for that redirect. Website sign-in happens on the
  website; the extension retains the PKCE verifier, exchanges the callback code
  directly with ZetaLog, and stores only an independent revocable credential.
  Website tokens never cross the page.
- `/how-it-works` links to the live Store listing. The hardcoded fallback in
  `apps/web/app/how-it-works/page.tsx` carries the real listing URL, so
  `NEXT_PUBLIC_CHROME_WEB_STORE_URL` is optional and only needed to override it.

## 1.0.1 release notes

Include the following in the Chrome Web Store "What's new" text for this
release:

> Linking is more reliable. The extension now checks that the service accepts
> this release before opening the sign-in window, so a failed link explains
> itself instead of flashing a disappearing window, and each failure shows a
> specific, actionable message.

Silent migration from a still-valid legacy session is accepted only through
**3 November 2026** and is server-refused from **4 November 2026 UTC**. Raw
session handoff through the link page has been removed already. Different-ID
unpacked beta users follow the explicit one-time transition communication in the
release runbook.

## Version history

- **1.0.1** (release candidate, 2026-08-19): link-status preflight before the
  identity window opens, specific link-failure messages in the popup and on the
  link page, and removal of the retired website ZIP download in favour of the
  Store listing.
- **1.0.0** (published 2026-08-10): initial Chrome Web Store release.
  Includes the score recorder and leaderboard, independent extension
  credentials, browser-owned PKCE linking, silent migration of valid legacy
  sessions, offline-eligible ranking, and the legacy-compatibility sunset plan.
