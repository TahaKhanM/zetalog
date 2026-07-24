# ZetaLog — Chrome Web Store submission

Single source of truth for publishing the ZetaLog extension. Store-listing copy
lives in `docs/store/listing.md`; the privacy policy is at
`docs/store/privacy-policy.md` and served live at
https://www.zetalog.co.uk/privacy.

Last updated: 24 July 2026 · Version: 1.0.0

## Build the package

From the repo root:

```bash
pnpm --filter @zetalog/extension zip
```

Output: `apps/extension/.output/zetalogextension-<version>-chrome.zip`. WXT builds
in production mode, which strips the `localhost` content-script match, and its
zip excludes source, tests and configs. Upload that file in the dashboard.

## Readiness audit (1.0.0)

Verified against the built `chrome-mv3` manifest and zip on 24 July 2026.

| Check                                                           | Status                             |
| --------------------------------------------------------------- | ---------------------------------- |
| Manifest V3, no V2 APIs                                         | Pass                               |
| Version 1.0.0 (was 0.0.0)                                       | Pass                               |
| Name matches listing ("ZetaLog")                                | Pass                               |
| Description ≤ 132 chars, no fluff                               | Pass (69 chars)                    |
| Icons: 16/32/48/96/128 all present, real PNGs                   | Pass                               |
| Permissions minimal: `storage`, `alarms` only                   | Pass                               |
| No `<all_urls>`; host access via content-script matches only    | Pass                               |
| Production build strips `localhost` match                       | Pass (0 localhost in zip manifest) |
| No remote code; all JS bundled                                  | Pass                               |
| No dev-file leaks in zip (.map, .ts, tests, .env, node_modules) | Pass                               |
| Privacy policy live at a stable URL                             | Pass (/privacy)                    |
| Single-purpose statement written                                | Pass                               |
| Per-permission justifications written                           | Pass (listing.md)                  |
| Data-use disclosure mapped                                      | Pass (listing.md)                  |
| Content script only on zetamac.com + zetalog.co.uk/link         | Pass                               |
| Popup loads without console errors                              | Pass (verified in preview)         |
| Uninstall clean (all state in chrome.storage.local)             | Pass                               |

### Manual, done at submission (cannot be automated here)

- [ ] Load the unpacked `chrome-mv3` build in Chrome and play a real Zetamac game;
      confirm the popup fills and the link flow reaches "Linked".
- [ ] Capture the five screenshots listed in `docs/store/listing.md` at 1280×800.
- [ ] Store icon: use `Assets/icons/icon-128.png` (128×128, no transparency issues).
- [ ] Optional small promo tile 440×280.
- [ ] Confirm https://www.zetalog.co.uk/privacy loads before submitting.

## Dashboard steps

1. chromewebstore.google.com/devconsole, pay the one-time developer fee if this
   is the first extension on the account.
2. New item, upload the zip.
3. Store listing tab: name, category (Productivity), short + detailed description,
   screenshots, store icon. Copy from `docs/store/listing.md`.
4. Privacy practices tab: single-purpose statement, one justification per
   permission and per host, and the data-use disclosure. Copy from `listing.md`.
5. Privacy policy URL: https://www.zetalog.co.uk/privacy.
6. Submit for review. First reviews typically take a few days.

## Known post-publish follow-ups

- The extension config (`apps/extension/lib/config.ts`) already points at the
  production site and the real Supabase URL and anon key. No secrets ship (the
  anon key is public by design; RLS is the security boundary).
- No `chrome.identity` OAuth is used, so there is no store-assigned-ID OAuth
  client to update after publishing. Sign-in happens on the website, and the
  session is handed to the extension through the `/link` page.
- After the store ID is assigned, update any docs that reference installing by
  "Load unpacked" (the `/how-it-works` install section) to point at the store
  listing instead.

## Version history

- **1.0.0** (2026-07-24): first store submission. Modern neutral theme with a
  light/dark switch, worldwide leaderboard sync, university badges, and the
  per-problem analysis view.
