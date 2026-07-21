# ZetaLog — Privacy Policy

_Last updated: 2026-07-21_

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

ZetaLog does **not** collect your browsing history, the other sites or tabs you
visit, your keystrokes anywhere other than the Zetamac answer box during a game,
your IP-based location, or any advertising identifiers. ZetaLog contains no
analytics or tracking of any kind.

## How data is stored

By default, everything above is stored **only on your device**, in the browser's
local extension storage (`chrome.storage.local`). It is not sent anywhere.

## Leaderboard sync (opt-in)

Uploading is off until you choose to turn it on. If you click "Sync to
leaderboard", sign in on the ZetaLog website, and click "Link the ZetaLog
extension", ZetaLog stores your ZetaLog account session on your device and then
uploads your **game results** — the same game telemetry, configuration, score,
and play time listed above — to the ZetaLog backend so your best scores can be
ranked. Uploaded scores are re-verified on the server from the submitted
telemetry; only games that pass are ranked.

- **Why**: solely to compute and display leaderboards and your per-account history.
- **What is not uploaded**: no browsing data, and nothing at all while you are signed out.
- **Third-party services**: the ZetaLog backend runs on Supabase (database and authentication). Data is processed there on ZetaLog's behalf. See Supabase's privacy policy at https://supabase.com/privacy.
- **Sharing**: your recorded games are not sold or shared with any other third party. A leaderboard shows your chosen display name and best scores to other ZetaLog users; you control your display name and may leave the leaderboard by removing your games or your account.

## Data retention and deletion

- **Local data**: remove any single game from the extension popup (this soft-deletes it locally and, if it was synced, requests its removal from the leaderboard). Uninstalling the extension deletes all local ZetaLog data.
- **Unlink**: clicking "Unlink" in the popup forgets your account session and the pending-upload queue on the device and stops all syncing. Your local game history is left intact.
- **Uploaded data**: removing a game requests deletion of the corresponding leaderboard entry; deleting your ZetaLog account removes your uploaded games. Removed games are excluded from ranking.

## Changes to this policy

If ZetaLog's data practices change, this policy will be updated and its
"Last updated" date revised. Material changes will be noted in the extension's
release notes.

## Contact

Questions about this policy or your data: contact.mtaha@gmail.com
