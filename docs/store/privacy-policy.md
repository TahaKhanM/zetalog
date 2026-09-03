# ZetaLog — Privacy Policy

_Last updated: 2026-08-09_

ZetaLog is a browser extension that records your results on the Zetamac
arithmetic game (arithmetic.zetamac.com) and shows your progress, with an
optional feature to sync your best scores to the ZetaLog leaderboard. This
policy explains exactly what data ZetaLog handles.

## What data is collected

ZetaLog records, for each Zetamac game you play:

- The game's configuration (which operations are enabled and their number ranges, and the duration).
- The game's telemetry: the sequence of problems shown, the values you typed into the answer box, and each correct answer, with timestamps relative to the start of the game.
- The resulting score and the time you played.
- Your popup preferences (which configuration and trend range you last viewed).
- If you link the extension, a random ZetaLog account identifier and a revocable extension credential.

ZetaLog does **not** collect your browsing history, the other sites or tabs you
visit, your keystrokes anywhere other than the Zetamac answer box during a game,
your precise or GPS location, or any advertising identifiers. During account
linking, the server processes the request IP address for abuse prevention and
stores only its hash as a rate-limit key. Raw IP addresses are not stored by
ZetaLog, and inactive rate-limit keys are deleted after two days. ZetaLog
contains no analytics or advertising tracking.

## How data is stored

By default, everything above is stored **only on your device**, in the browser's
local extension storage (`chrome.storage.local`). It is not sent anywhere. The
extension can record games while offline or unlinked; it uploads only after you
choose to link and sync, and may retry pending uploads when it next connects.
An otherwise eligible game recorded offline is assessed under the same ranking
rules when it later syncs.

## Leaderboard sync (opt-in)

Uploading is off until you choose to turn it on. If you click "Sync to
leaderboard", sign in on the ZetaLog website, and click "Link the ZetaLog
extension", ZetaLog stores a sign-in credential on your device while it is
linked and then uploads your **game results** — the same game telemetry,
configuration, score, and play time listed above — to the ZetaLog backend so
your best scores can be ranked. Uploaded scores are checked automatically from
the submitted telemetry. These checks help identify invalid submissions, but do
not prove that every ranked result is genuine.

- **Why**: solely to compute and display leaderboards and your per-account history.
- **Link authentication**: after one explicit Link click, the extension uses Chrome Identity and PKCE to open a browser-owned sign-in redirect. Completing that sign-in also creates the normal first-party ZetaLog website session for this browser profile. The extension keeps the PKCE verifier, validates the exact callback, and exchanges its one-time code directly for a separate revocable credential. No credential, website session token, authorization code, or PKCE verifier is exposed to page scripts or the content script. Chrome 116 or later is required for this Manifest V3 flow. A valid legacy installation migrates silently. Only an already-broken legacy session needs this one action, and the server rejects legacy credentials from 4 November 2026 UTC.
- **What is not uploaded**: no general browsing data, and nothing at all while the extension is unlinked. Signing out of the website does not by itself unlink an already-linked extension; use Unlink in the popup to revoke it. Unlinking the extension does not sign the website out; use the website's sign-out action separately.
- **Processors**: Supabase provides authentication and database services; Vercel hosts the website; and Resend delivers university-verification emails. If you choose Google or GitHub sign-in, that provider also processes your authentication request under its own policy. See Supabase's privacy policy at https://supabase.com/privacy.
- **Sharing**: your recorded games are not sold. A public leaderboard shows your chosen display name, university badge (if verified), and best scores. You can opt out from the leaderboard in Account, remove individual games from ranking, or delete your account.

## Data retention and deletion

- **Local data**: remove any single game from the extension popup. Uninstalling the extension deletes local extension storage, including local game history and link state.
- **Unlink**: clicking "Unlink" immediately removes the active link and pending-upload queue and stops all syncing. The extension immediately attempts to revoke and delete the installation credential. If the device is offline or the service is temporarily unavailable, it keeps only that inactive credential in protected extension storage until a background retry confirms that it is unusable, then deletes it. Your local game history is left intact.
- **Uploaded data**: removing a game marks it removed and excludes it from public rankings; it is retained with your account for history and audit purposes. Deleting your account from Account settings immediately deletes its profile, uploaded game telemetry, university-verification data, and extension credentials. An account-deletion security event containing no account identifier is retained for no more than 30 days and then deleted automatically. Removed games are excluded from ranking.

## Limited use

ZetaLog uses the data handled by the extension only to record Zetamac games,
show the user's progress, authenticate an optional linked account, and provide
the leaderboard features described above. It does not sell the data, use it for
advertising or credit decisions, or allow human access except when necessary to
investigate a specifically quarantined score, provide support with the user's
consent, comply with law, or protect the service from abuse.

## Changes to this policy

If ZetaLog's data practices change, this policy will be updated and its
"Last updated" date revised. Material changes will be noted in the extension's
release notes.

## Contact

Questions about this policy or your data: contact.mtaha@gmail.com
