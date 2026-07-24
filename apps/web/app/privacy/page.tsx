import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What data the ZetaLog extension handles and how.',
};

export const dynamic = 'force-static';

/**
 * `/privacy` (CO-12): the public privacy policy. Required as a live URL for the
 * Chrome Web Store listing because the extension transmits game results when an
 * account is linked. Kept in sync with docs/store/privacy-policy.md.
 */
export default function PrivacyPage(): React.JSX.Element {
  return (
    <article className="prose board-enter">
      <h1 className="display board-title">Privacy policy</h1>
      <p className="meta">Last updated: 24 July 2026</p>

      <p>
        ZetaLog is a browser extension that records your results on the Zetamac arithmetic game
        (arithmetic.zetamac.com) and shows your progress. It has an optional feature to sync your
        best scores to the ZetaLog leaderboard. This policy explains what data ZetaLog handles.
      </p>

      <h2 className="prose__h2">What data is collected</h2>
      <p>ZetaLog records, for each Zetamac game you play:</p>
      <ul>
        <li>The game settings: which operations are on, their number ranges, and the duration.</li>
        <li>
          The game telemetry: the problems shown, the values you typed into the answer box, and each
          correct answer, with timestamps relative to the start of the game.
        </li>
        <li>The resulting score and the time you played.</li>
        <li>Your popup preferences: the configuration and trend range you last viewed.</li>
      </ul>
      <p>
        ZetaLog does not collect your browsing history, the other sites or tabs you visit, your
        keystrokes anywhere other than the Zetamac answer box during a game, your location, or any
        advertising identifiers. It contains no analytics or tracking.
      </p>

      <h2 className="prose__h2">How data is stored</h2>
      <p>
        By default everything above is stored only on your device, in the browser&apos;s local
        extension storage. It is not sent anywhere.
      </p>

      <h2 className="prose__h2">Leaderboard sync (opt-in)</h2>
      <p>
        Uploading is off until you turn it on. If you press Sync to leaderboard, sign in on the
        ZetaLog website, and link the extension, ZetaLog stores your account session on your device
        and uploads your game results (the telemetry, settings, score, and play time above) so your
        best scores can be ranked. Uploaded scores are re-checked on the server from the submitted
        telemetry. Only games that pass are ranked.
      </p>
      <ul>
        <li>Why: to compute and show the leaderboards and your per-account history.</li>
        <li>
          What is not uploaded: no browsing data, and nothing at all while you are signed out.
        </li>
        <li>
          Third-party services: the ZetaLog backend runs on Supabase for its database and sign-in.
          Data is processed there on ZetaLog&apos;s behalf. See{' '}
          <a href="https://supabase.com/privacy" target="_blank" rel="noreferrer noopener">
            Supabase&apos;s privacy policy
          </a>
          .
        </li>
        <li>
          Sharing: your recorded games are not sold or shared with any other third party. A
          leaderboard shows your chosen display name and best scores to other ZetaLog users. You
          control your display name and can leave the board by removing your games or your account.
        </li>
      </ul>

      <h2 className="prose__h2">Data retention and deletion</h2>
      <ul>
        <li>
          Local data: remove any single game from the popup. That soft-deletes it on your device
          and, if it was synced, asks the leaderboard to drop it. Uninstalling the extension deletes
          all local ZetaLog data.
        </li>
        <li>
          Unlink: pressing Unlink in the popup forgets your account session and the pending-upload
          queue and stops syncing. Your local history stays intact.
        </li>
        <li>
          Uploaded data: removing a game asks for its leaderboard entry to be deleted. Deleting your
          account removes your uploaded games. Removed games do not rank.
        </li>
      </ul>

      <h2 className="prose__h2">Changes to this policy</h2>
      <p>
        If ZetaLog&apos;s data practices change, this policy is updated and its date revised.
        Material changes are noted in the extension&apos;s release notes.
      </p>

      <h2 className="prose__h2">Contact</h2>
      <p>
        Questions about this policy or your data:{' '}
        <a href="mailto:contact.mtaha@gmail.com">contact.mtaha@gmail.com</a>
      </p>
    </article>
  );
}
