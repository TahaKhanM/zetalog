import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { chromeWebStoreUrl } from '@/lib/chrome-store';

export const metadata: Metadata = {
  title: 'How ZetaLog works',
  description:
    'Learn what ZetaLog does, install it from the Chrome Web Store, record your first Zetamac game and optionally sync to the leaderboard.',
};

/** Static product page. There is no data to revalidate here. */
export const dynamic = 'force-static';

const ZETAMAC_URL = 'https://arithmetic.zetamac.com';
const OFFICIAL_STORE_URL =
  'https://chromewebstore.google.com/detail/zetalog/bhbpjdngipckdepgblhopdfijnpeefml';
const EXTENSION_STORE_URL =
  chromeWebStoreUrl(process.env.NEXT_PUBLIC_CHROME_WEB_STORE_URL) ?? OFFICIAL_STORE_URL;

function StoreButton({ compact = false }: { compact?: boolean }): React.JSX.Element {
  return (
    <a
      href={EXTENSION_STORE_URL}
      target="_blank"
      rel="noreferrer noopener"
      className={`hiw-store-button${compact ? ' hiw-store-button--compact' : ''}`}
      aria-label="Open the ZetaLog listing in the Chrome Web Store"
    >
      <Image src="/badges/chrome-reviewer.png" alt="" width={48} height={48} />
      <span className="hiw-store-button__copy">
        <span>Available in the Chrome Web Store</span>
        <strong>Add ZetaLog to Chrome</strong>
      </span>
      <span className="hiw-store-button__arrow" aria-hidden="true">
        ↗
      </span>
    </a>
  );
}

export default function HowItWorksPage(): React.JSX.Element {
  return (
    <div className="hiw board-enter">
      <section className="hiw-hero" aria-labelledby="hiw-title">
        <div className="hiw-hero__copy">
          <p className="hiw-eyebrow display">How it works</p>
          <h1 className="display hiw-hero__title" id="hiw-title">
            Track every Zetamac game. See your progress.
          </h1>
          <p className="hiw-hero__lede">
            ZetaLog is a free Chrome extension for{' '}
            <a href={ZETAMAC_URL} target="_blank" rel="noreferrer noopener">
              Zetamac
            </a>
            . Play the usual timed arithmetic game and ZetaLog records the result, shows your
            progress and—only if you choose—syncs eligible scores to the leaderboard.
          </p>
          <div className="hiw-hero__actions">
            <StoreButton />
            <a href="#install" className="btn btn--ghost hiw-hero__secondary">
              Show me how to install it
            </a>
          </div>
          <ul className="hiw-trust" aria-label="Key facts">
            <li>No account needed to start</li>
            <li>Records completed games automatically</li>
            <li>Desktop Chrome</li>
          </ul>
        </div>

        <figure className="hiw-hero__figure">
          <div className="hiw-hero__screens">
            <Image
              className="hiw-hero__game"
              src="/how-it-works/zetamac-game.jpg"
              alt="A live Zetamac arithmetic game with 120 seconds left"
              width={1280}
              height={800}
              sizes="(max-width: 760px) 92vw, 38rem"
              preload
            />
            <Image
              className="hiw-hero__popup"
              src="/how-it-works/extension-overview.png"
              alt="The real ZetaLog extension popup showing a latest score, personal bests and recent games"
              width={360}
              height={620}
              sizes="(max-width: 520px) 34vw, 13rem"
              preload
            />
          </div>
          <figcaption>Real screens from the current Zetamac site and ZetaLog extension.</figcaption>
        </figure>
      </section>

      <nav className="hiw-jump" aria-label="On this page">
        <span className="hiw-jump__label display">On this page</span>
        <a href="#basics">What it does</a>
        <a href="#install">Install</a>
        <a href="#first-game">Your first game</a>
        <a href="#leaderboard">Leaderboard sync</a>
        <a href="#questions">Questions</a>
      </nav>

      <section className="hiw-section" id="basics" aria-labelledby="basics-title">
        <div className="hiw-section__heading">
          <p className="hiw-eyebrow display">The simple version</p>
          <h2 className="display" id="basics-title">
            Zetamac is the game. ZetaLog remembers it.
          </h2>
          <p>
            Zetamac is a browser-based mental arithmetic drill: choose a time, solve as many
            questions as you can and finish with a score. ZetaLog does not replace or alter that
            game. It adds the history, progress view and optional leaderboard that Zetamac does not
            keep for you.
          </p>
        </div>

        <ol className="hiw-flow" aria-label="The ZetaLog workflow">
          <li>
            <span className="hiw-flow__number num">1</span>
            <div>
              <h3>Play on Zetamac</h3>
              <p>Use Zetamac normally. You do not need to start a game from ZetaLog.</p>
            </div>
          </li>
          <li>
            <span className="hiw-flow__number num">2</span>
            <div>
              <h3>Your result is saved</h3>
              <p>When the timed game finishes, the extension records the score and settings.</p>
            </div>
          </li>
          <li>
            <span className="hiw-flow__number num">3</span>
            <div>
              <h3>Review or sync it</h3>
              <p>See recent games locally, or link an account to join the leaderboards.</p>
            </div>
          </li>
        </ol>

        <aside className="hiw-new card" aria-label="New to Zetamac">
          <span className="hiw-new__label display">Never used Zetamac?</span>
          <p>
            Start with the default <span className="num">120s</span> game. Press Start, type each
            answer and press Enter; a new question appears after every correct answer. Your final
            score is the number you answered correctly before time ran out.
          </p>
          <a href={ZETAMAC_URL} target="_blank" rel="noreferrer noopener">
            Open Zetamac to see the game ↗
          </a>
        </aside>
      </section>

      <section className="hiw-section hiw-install" id="install" aria-labelledby="install-title">
        <div className="hiw-section__heading hiw-section__heading--center">
          <p className="hiw-eyebrow display">Install in about 30 seconds</p>
          <h2 className="display" id="install-title">
            Add ZetaLog from the Chrome Web Store
          </h2>
          <p>
            This is a normal Store installation. There is no ZIP file, Developer mode or manual
            update process.
          </p>
        </div>

        <div className="hiw-install__store card">
          <div>
            <p className="display hiw-install__store-label">Official extension</p>
            <h3>ZetaLog for Google Chrome</h3>
            <p>Chrome checks the package and installs future updates automatically.</p>
          </div>
          <StoreButton compact />
        </div>

        <ol className="hiw-install__steps">
          <li className="card">
            <span className="hiw-install__number num">1</span>
            <div>
              <h3>Install it</h3>
              <p>
                Open the Store listing above, click <strong>Add to Chrome</strong>, then confirm by
                clicking <strong>Add extension</strong>. Wait for Chrome to say ZetaLog was added.
              </p>
            </div>
          </li>
          <li className="card">
            <span className="hiw-install__number num">2</span>
            <div>
              <h3>Find it and pin it</h3>
              <p>
                At the top-right of Chrome, click the <strong>Extensions</strong> button (the
                puzzle-piece icon). Find <strong>ZetaLog</strong> in the menu and click the pin
                beside it. The ZetaLog logo will then stay next to the address bar.
              </p>
              <p className="hiw-install__tip">
                Pinning is only a shortcut. ZetaLog still records games if its icon is not pinned.
              </p>
            </div>
          </li>
          <li className="card">
            <span className="hiw-install__number num">3</span>
            <div>
              <h3>Open or refresh Zetamac</h3>
              <p>
                Go to{' '}
                <a href={ZETAMAC_URL} target="_blank" rel="noreferrer noopener">
                  arithmetic.zetamac.com
                </a>
                . If it was already open when you installed ZetaLog, refresh that tab once before
                starting your first game.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="hiw-section" id="first-game" aria-labelledby="first-game-title">
        <div className="hiw-showcase">
          <figure className="hiw-screenshot hiw-screenshot--wide">
            <Image
              src="/how-it-works/zetamac-game.jpg"
              alt="A real Zetamac game asking 32 plus 55 with the timer and score visible"
              width={1280}
              height={800}
              sizes="(max-width: 760px) 92vw, 31rem"
            />
            <figcaption>
              The extension watches for a completed game; it does not interrupt play.
            </figcaption>
          </figure>
          <div className="hiw-showcase__copy">
            <p className="hiw-eyebrow display">Your first game</p>
            <h2 className="display" id="first-game-title">
              Just play until the timer ends.
            </h2>
            <ol className="hiw-play-list">
              <li>
                Choose Zetamac settings or leave the defaults, then press <strong>Start</strong>.
              </li>
              <li>Type answers and press Enter. Keep going until the timer reaches zero.</li>
              <li>
                Open the ZetaLog icon after the game ends. Your score should appear under Latest and
                Recent.
              </li>
            </ol>
            <p className="hiw-note">
              A game has to finish for ZetaLog to save it. Closing the tab or restarting mid-game
              will not create a normal completed result.
            </p>
          </div>
        </div>
      </section>

      <section className="hiw-section" aria-labelledby="history-title">
        <div className="hiw-showcase hiw-showcase--reverse">
          <div className="hiw-showcase__copy">
            <p className="hiw-eyebrow display">Inside the extension</p>
            <h2 className="display" id="history-title">
              See progress without making an account.
            </h2>
            <p>
              Click the ZetaLog icon to open the popup. Local tracking works immediately after
              installation and keeps your games on this browser.
            </p>
            <ul className="hiw-bullets">
              <li>Your latest score and any new personal best.</li>
              <li>Your best results for 30, 60 and 120 second games.</li>
              <li>A trend line and a chronological list of recent games.</li>
              <li>Clear status labels for saved, synced or reviewed entries.</li>
            </ul>
          </div>
          <figure className="hiw-popup-pair">
            <Image
              src="/how-it-works/extension-overview.png"
              alt="The top of the real ZetaLog popup with score 58, personal bests and a trend line"
              width={360}
              height={620}
              sizes="(max-width: 560px) 44vw, 12rem"
            />
            <Image
              src="/how-it-works/extension-history.png"
              alt="The real ZetaLog recent-games list with synced, review, removed and restore statuses"
              width={360}
              height={620}
              sizes="(max-width: 560px) 44vw, 12rem"
            />
            <figcaption>Real captures of the current extension popup.</figcaption>
          </figure>
        </div>
      </section>

      <section className="hiw-section" id="leaderboard" aria-labelledby="leaderboard-title">
        <div className="hiw-section__heading">
          <p className="hiw-eyebrow display">Optional account linking</p>
          <h2 className="display" id="leaderboard-title">
            Sync when you want to join the leaderboard.
          </h2>
          <p>
            Signing in to the website does not silently give the extension access to your account.
            After signing in, you link this Chrome installation once; that explicit step lets the
            extension upload eligible games and keeps the two sessions secure.
          </p>
        </div>

        <div className="hiw-choices">
          <article className="card">
            <p className="hiw-choice__label display">Without an account</p>
            <h3>Keep a local score history</h3>
            <p>Play, review personal bests and inspect recent games in this browser.</p>
          </article>
          <article className="card hiw-choice--accent">
            <p className="hiw-choice__label display">With a linked account</p>
            <h3>Sync eligible games automatically</h3>
            <p>Appear on global and university boards and view progress on the website.</p>
          </article>
        </div>

        <div className="hiw-link-steps card">
          <h3 className="display">How to link it</h3>
          <ol>
            <li>Create an account or sign in on ZetaLog.</li>
            <li>
              Open the extension and choose <strong>Sync to leaderboard</strong>.
            </li>
            <li>
              If prompted, choose <strong>Link the ZetaLog extension</strong> and finish the secure
              Chrome sign-in window.
            </li>
            <li>
              Return to the popup. It should say <strong>Linked to leaderboard</strong>.
            </li>
          </ol>
          <p>
            <Link href="/link" className="btn btn--primary">
              Link this extension
            </Link>
            <Link href="/signin" className="btn btn--ghost">
              Sign in first
            </Link>
          </p>
        </div>

        <div className="hiw-sync-visuals">
          <figure className="hiw-screenshot hiw-screenshot--leaderboard">
            <Image
              src="/how-it-works/leaderboard.jpg"
              alt="The real ZetaLog global leaderboard with players ranked by their best 120-second score"
              width={1280}
              height={800}
              sizes="(max-width: 760px) 92vw, 36rem"
            />
            <figcaption>Eligible scores can appear on the global and university boards.</figcaption>
          </figure>
          <figure className="hiw-screenshot hiw-screenshot--popup">
            <Image
              src="/how-it-works/extension-sync.png"
              alt="The bottom of the real ZetaLog popup showing Linked to leaderboard and synced games"
              width={360}
              height={620}
              sizes="(max-width: 760px) 46vw, 13rem"
            />
            <figcaption>The popup shows whether this browser is linked.</figcaption>
          </figure>
        </div>
      </section>

      <section className="hiw-section hiw-faq" id="questions" aria-labelledby="questions-title">
        <div className="hiw-section__heading hiw-section__heading--center">
          <p className="hiw-eyebrow display">Common questions</p>
          <h2 className="display" id="questions-title">
            Useful things to know
          </h2>
        </div>
        <div className="hiw-faq__list">
          <details className="card">
            <summary>Do I need an account?</summary>
            <p>
              No. Score tracking, personal bests and recent history work locally without an account.
              You only need to link an account for website progress and leaderboards.
            </p>
          </details>
          <details className="card">
            <summary>Does the extension have to stay pinned?</summary>
            <p>
              No. Pinning only keeps the popup one click away. Automatic recording works while the
              extension is installed, whether or not the icon is pinned.
            </p>
          </details>
          <details className="card">
            <summary>Why did my first score not appear?</summary>
            <p>
              Refresh Zetamac once if the tab was open before installation, then complete a full
              game and reopen the popup. Restarted or abandoned games are not treated like normal
              completed results.
            </p>
          </details>
          <details className="card">
            <summary>Does ZetaLog change or control Zetamac?</summary>
            <p>
              No. Zetamac remains the game and ZetaLog reads the completed result. ZetaLog is not
              affiliated with Zetamac.
            </p>
          </details>
          <details className="card">
            <summary>What gets uploaded?</summary>
            <p>
              Nothing is sent to your ZetaLog account until you link the extension. Once linked,
              eligible game records are uploaded for server validation. Read the{' '}
              <Link href="/privacy">privacy policy</Link> for the full data description.
            </p>
          </details>
        </div>
      </section>

      <section className="hiw-final card" aria-label="Install ZetaLog">
        <div>
          <p className="hiw-eyebrow display">Ready to try it?</p>
          <h2 className="display">Your next Zetamac score can save itself.</h2>
          <p>Install from the official Store listing, refresh Zetamac once and play as normal.</p>
        </div>
        <StoreButton compact />
      </section>
    </div>
  );
}
