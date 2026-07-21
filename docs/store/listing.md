# Chrome Web Store listing — ZetaLog

Source of truth for the Chrome Web Store dashboard fields. Copy each section into
the corresponding field at publish time. Keep this file in sync with
`apps/extension/wxt.config.ts` (name, description, permissions) and the privacy
policy (`docs/store/privacy-policy.md`).

## Name

ZetaLog

## Category

Productivity

## Short description (≤ 132 characters)

Automatically tracks your Zetamac arithmetic scores and charts your progress over time. Optional leaderboard sync.

## Detailed description

ZetaLog records every game you play on Zetamac (arithmetic.zetamac.com) and turns
your history into a clear picture of how you are improving — no copying scores
into a spreadsheet, no manual logging.

FEATURES
• Automatic score capture — play Zetamac as usual; ZetaLog records the result the moment a game ends.
• Progress over time — a trend that adapts to your history: a recent-scores list, then a sparkline, then a full chart as you play more.
• Personal bests — your best score at each standard duration (30s, 60s, 120s), for the default configuration.
• Honest history — restarted or unusually fast games are flagged for review rather than silently counted, and nothing is ever hard-deleted; you can restore or remove any game.
• Works fully offline — everything runs locally and the extension is completely functional without an account.
• Optional leaderboard — link a ZetaLog account to compare your best scores on the global and UK-university leaderboards. Every submitted score is re-verified server-side, so only genuine games rank.

HOW TO USE

1. Install ZetaLog and play a round at arithmetic.zetamac.com.
2. Click the ZetaLog toolbar icon to see your latest score, personal bests, and trend.
3. (Optional) Click "Sync to leaderboard", sign in on the ZetaLog site, and click "Link the ZetaLog extension" to start syncing your best scores.

PRIVACY
ZetaLog stores your game history on your own device. Nothing is uploaded unless
you choose to link an account, and even then only your game results are sent —
never your browsing. Full details: see the privacy policy linked below.

PERMISSIONS
• Storage — saves your recorded games, preferences, and (if you link an account) your session on your device.
• Alarms — schedules background retries so that, when leaderboard sync is enabled, a score that failed to upload is retried later.
• Access to arithmetic.zetamac.com — reads the running game (problems, answers, score, timer) to record your result. This is the core feature and the only site ZetaLog reads.
• Access to the ZetaLog link page (zetalog.vercel.app/link) — receives the sign-in handoff after you explicitly click "Link the ZetaLog extension". Used only to connect your account.

SUPPORT
Questions or bugs: contact.mtaha@gmail.com

## Single-purpose statement

ZetaLog has one purpose: to record the results of your Zetamac arithmetic games
and present your progress, with an optional opt-in sync of your best scores to the
ZetaLog leaderboard.

## Permission justifications (dashboard "Privacy practices" tab)

Write one specific justification per permission. "Needed for the extension to
work" is rejected.

- **storage** — Persists the user's recorded games, popup preferences (selected configuration and trend range), and, when an account is linked, the session and the pending-upload queue. All of this lives in `chrome.storage.local` on the user's device.
- **alarms** — When leaderboard sync is enabled, uploads run in the background service worker. `alarms` schedules the retry drain (exponential backoff, capped at two hours) so a score that could not be uploaded — e.g. the device was offline — is retried without keeping a page open.
- **Host access — `*://arithmetic.zetamac.com/*`** — The content script reads the live game (the current problem, the answer field, the running score, and the countdown) to record each finished game. This is ZetaLog's core function; it reads no other site through this permission.
- **Host access — `https://zetalog.vercel.app/link*` (and `http://localhost:3000/link*` for local development)** — A content script on the ZetaLog link page receives the account session the page hands off after the user clicks "Link the ZetaLog extension". It reads nothing else on the page and runs on no other URL. Localhost is included only so contributors can test the flow locally; it can be removed from the published build.

## Screenshots to capture (1280×800 or 640×400, no placeholders)

1. **Popup — main view**: the popup open next to a Zetamac game, showing the latest score hero, the 30/60/120 personal-best row, and the adaptive trend chart. Use real recorded games so the numerals are populated.
2. **Popup — recent games with statuses**: the recent-games list showing a mix of kept games and one quarantined ("Restart") row, demonstrating the review-not-delete behaviour and the Restore/Remove controls.
3. **Popup — signed-in footer**: the footer in its "Syncing to leaderboard" state with per-game "Synced" chips, showing that sync is opt-in and visible.
4. **Web leaderboard**: the ZetaLog site's leaderboard (global or a university tab) with the ranked table, to show where synced scores appear.
5. **Link page**: the `/link` page with the "Link the ZetaLog extension" button, illustrating the explicit, click-to-connect handoff.

## Privacy policy URL

Host `docs/store/privacy-policy.md` at a public, stable URL (e.g. GitHub Pages or
the ZetaLog site at `/privacy`) and enter that URL in the dashboard. Required
because ZetaLog transmits game results when an account is linked.
