import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What data the ZetaLog extension handles and how.',
};

export const dynamic = 'force-static';

/**
 * `/privacy`: the public privacy policy. Required as a live URL for the
 * Chrome Web Store listing because the extension transmits game results when an
 * account is linked. Kept in sync with docs/store/privacy-policy.md.
 */
export default function PrivacyPage(): React.JSX.Element {
  return (
    <article className="prose board-enter">
      <h1 className="display board-title">Privacy policy</h1>
      <p className="meta">Last updated: 9 August 2026</p>

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
        <li>
          If you link the extension, a random ZetaLog account identifier and a revocable extension
          credential.
        </li>
      </ul>
      <p>
        ZetaLog does not collect your browsing history, the other sites or tabs you visit, your
        keystrokes anywhere other than the Zetamac answer box during a game, your precise or GPS
        location, or any advertising identifiers. During account linking, the server processes the
        request IP address for abuse prevention and stores only its hash as a rate-limit key. Raw IP
        addresses are not stored by ZetaLog, and inactive rate-limit keys are deleted after two
        days. ZetaLog contains no analytics or advertising tracking.
      </p>

      <h2 className="prose__h2">How data is stored</h2>
      <p>
        By default everything above is stored only on your device, in the browser&apos;s local
        extension storage. It is not sent anywhere. The extension can record games while you are
        offline or unlinked. It does not upload them until you choose to link and sync; a linked
        extension may retry pending uploads when it next has a connection. An otherwise eligible
        game recorded offline is assessed under the same ranking rules when it later syncs.
      </p>

      <h2 className="prose__h2">Leaderboard sync (opt-in)</h2>
      <p>
        Uploading is off until you turn it on. If you press Sync to leaderboard, sign in on the
        ZetaLog website, and link the extension, ZetaLog stores a sign-in credential on your device
        while it is linked and uploads your game results (the telemetry, settings, score, and play
        time above) so your best scores can be ranked. Uploaded scores are checked automatically
        from submitted telemetry. These checks help identify invalid submissions, but do not prove
        that every ranked result is genuine.
      </p>
      <ul>
        <li>Why: to compute and show the leaderboards and your per-account history.</li>
        <li>
          Link authentication: after one explicit Link click, the extension uses Chrome Identity and
          PKCE to open a browser-owned sign-in redirect. The extension keeps the PKCE verifier,
          validates the exact callback, and exchanges its one-time code directly for a revocable
          credential. No credential, website session token, authorization code, or PKCE verifier is
          exposed to page scripts or the content script. Chrome 116 or later is required for this
          Manifest V3 flow. A valid legacy installation migrates silently. Only an already-broken
          legacy session needs this one action, and the server rejects legacy credentials from 4
          November 2026 UTC.
        </li>
        <li>
          What is not uploaded: no general browsing data, and nothing at all while the extension is
          unlinked. Signing out of the website does not itself unlink an already-linked extension;
          use Unlink in the popup to revoke it.
        </li>
        <li>
          Processors: Supabase provides authentication and database services; Vercel hosts the
          website; and Resend delivers university-verification emails. If you choose Google or
          GitHub sign-in, that provider also processes your authentication request under its own
          policy. See{' '}
          <a href="https://supabase.com/privacy" target="_blank" rel="noreferrer noopener">
            Supabase&apos;s privacy policy
          </a>
          .
        </li>
        <li>
          Sharing: your recorded games are not sold. A public leaderboard shows your chosen display
          name, university badge (if you verify one), and best scores. You can opt out from the
          leaderboard in Account, remove individual games from ranking, or delete your account.
        </li>
      </ul>

      <h2 className="prose__h2">Data retention and deletion</h2>
      <ul>
        <li>
          Local data: remove any single game from the popup. Uninstalling the extension deletes
          local extension storage, including local game history and link state.
        </li>
        <li>
          Unlink: pressing Unlink immediately removes the active link and pending-upload queue and
          stops syncing. It immediately attempts to revoke and delete the installation credential.
          If the device is offline or the service is temporarily unavailable, it keeps only that
          inactive credential in protected extension storage until a background retry confirms that
          it is unusable, then deletes it. Your local history stays intact.
        </li>
        <li>
          Uploaded data: removing a game marks it removed and excludes it from public rankings; it
          is retained with your account for history and audit purposes. Deleting your account from
          Account settings immediately deletes the profile, uploaded game telemetry,
          university-verification data, and extension credentials. An account-deletion security
          event containing no account identifier is retained for no more than 30 days and then
          deleted automatically. Removed games do not rank.
        </li>
      </ul>

      <h2 className="prose__h2">Limited use</h2>
      <p>
        ZetaLog uses extension data only to record Zetamac games, show your progress, authenticate
        an optional linked account, and provide the leaderboard features above. It does not sell
        this data, use it for advertising or credit decisions, or allow human access except when
        necessary to investigate a specifically quarantined score, provide support with your
        consent, comply with law, or protect the service from abuse.
      </p>

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
