# Chrome Web Store listing — ZetaLog

Source of truth for the Chrome Web Store dashboard fields. Copy each section into
the matching field at publish time. Keep this file in sync with
`apps/extension/wxt.config.ts` (name, description, permissions) and the privacy
policy (`docs/store/privacy-policy.md`, live at https://www.zetalog.co.uk/privacy).

## Name

ZetaLog

## Category

Productivity

## Short description (≤ 132 characters)

Track your Zetamac arithmetic scores and compare your best on a worldwide leaderboard. Progress charts included.

## Detailed description

ZetaLog records every game you play on Zetamac (arithmetic.zetamac.com) and turns
your history into a clear picture of how you are improving. No copying scores into
a spreadsheet, no manual logging.

FEATURES
• Automatic score capture. Play Zetamac as usual and ZetaLog records the result the moment a game ends.
• Progress over time. A trend that adapts to your history: a recent-scores list, then a sparkline, then a full chart as you play more.
• Personal bests. Your best score at each standard duration (30s, 60s, 120s) for the default settings.
• Skill analysis. Your solve times broken down by operation and times table, with the specific problems that slow you down.
• Works offline. Everything runs on your device and the extension is fully functional without an account.
• Optional leaderboard. Link a ZetaLog account to compare your best scores worldwide, with a per-university board if you verify a UK student email. Every submitted score is re-checked on the server so only genuine games rank.

HOW TO USE

1. Install ZetaLog and play a round at arithmetic.zetamac.com.
2. Click the ZetaLog toolbar icon to see your latest score, personal bests and trend.
3. Optional: press Sync to leaderboard, sign in on the ZetaLog site and link the extension to start syncing your best scores.

PRIVACY
ZetaLog stores your game history on your own device. Nothing is uploaded unless
you link an account, and even then only your game results are sent, never your
browsing. Full details are in the privacy policy linked below.

PERMISSIONS
• Storage. Saves your recorded games, preferences and (if you link an account) your session on your device.
• Alarms. Schedules background retries so that, when leaderboard sync is on, a score that failed to upload is retried later.
• Access to arithmetic.zetamac.com. Reads the running game (problems, answers, score, timer) to record your result. This is the core feature and the only site ZetaLog reads.
• Access to the ZetaLog link page (www.zetalog.co.uk/link). Receives the sign-in handoff after you press Link the ZetaLog extension. Used only to connect your account.

SUPPORT
Questions or bugs: contact.mtaha@gmail.com

## Single-purpose statement

ZetaLog has one purpose: to record the results of your Zetamac arithmetic games
and present your progress, with an optional opt-in sync of your best scores to the
ZetaLog leaderboard.

## Permission justifications (dashboard "Privacy practices" tab)

Write one specific justification per permission. "Needed for the extension to
work" is rejected.

- **storage**. Persists the user's recorded games, popup preferences (selected configuration and trend range) and, when an account is linked, the session and the pending-upload queue. All of this lives in `chrome.storage.local` on the user's device.
- **alarms**. When leaderboard sync is on, uploads run in the background service worker. `alarms` schedules the retry drain (exponential backoff, capped at two hours) so a score that could not be uploaded, for example because the device was offline, is retried without keeping a page open.
- **Host access, `*://arithmetic.zetamac.com/*`**. The content script reads the live game (the current problem, the answer field, the running score and the countdown) to record each finished game. This is ZetaLog's core function. It reads no other site through this permission.
- **Host access, `https://www.zetalog.co.uk/link*`**. A content script on the ZetaLog link page receives the account session the page hands off after the user presses Link the ZetaLog extension. It reads nothing else on the page and runs on no other URL. The published build ships this production origin only. The `http://localhost:3000/link*` match used for local development is stripped from every non-development build by the `wxt.config.ts` `build:manifestGenerated` hook.

## Screenshots to capture (1280×800 or 640×400, no placeholders)

1. **Popup, main view**. The popup open next to a Zetamac game, showing the latest score, the 30/60/120 personal-best row and the adaptive trend chart. Use real recorded games so the numerals are populated.
2. **Popup, recent games with statuses**. The recent-games list showing kept games and one quarantined (Restart) row, demonstrating review-not-delete and the Restore/Remove controls.
3. **Popup, signed-in footer**. The footer in its Syncing to leaderboard state with per-game Synced chips, showing that sync is opt-in and visible.
4. **Web leaderboard**. The ZetaLog site's leaderboard (global or a university board) with the ranked table, to show where synced scores appear.
5. **How it works page**. The `/how-it-works` page, showing what the product does at a glance.

## Privacy policy URL

https://www.zetalog.co.uk/privacy (live). Required because ZetaLog transmits game
results when an account is linked. Keep it in sync with
`docs/store/privacy-policy.md`.

## Data-use disclosure form (dashboard)

- Collects: "Website content" (the Zetamac game state) and "User activity" (game
  results and play times). Does NOT collect personally identifiable information,
  health, financial, authentication, personal communications, location or web
  history.
- "Is this data transferred off the user's device?": YES, only game results, and
  only after the user links an account.
- "Is this data used or sold for purposes unrelated to the single purpose?": NO.
- "Is this data used to determine creditworthiness or for lending?": NO.
- Certify the three compliance statements (limited use, no unrelated sale, no
  creditworthiness).

## Third-party licenses

The extension bundles self-hosted fonts under the SIL Open Font License 1.1. The
attribution and full license text ship in the repository at
`THIRD-PARTY-LICENSES.md`.
