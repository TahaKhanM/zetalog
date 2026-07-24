import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How it works',
  description: 'What ZetaLog does, how scores are verified and how to install the extension.',
};

/** Static product page. Revalidation is irrelevant; there is no data here. */
export const dynamic = 'force-static';

const GITHUB_URL = 'https://github.com/TahaKhanM/zetalog';

/**
 * `/how-it-works` (CO-11): the product tour. A static page that explains the
 * whole flow and shows a faithful CSS replica of the extension popup, so the
 * preview always matches the current theme without shipping screenshots.
 */
export default function HowItWorksPage(): React.JSX.Element {
  return (
    <div className="hiw board-enter">
      <section className="hiw-hero" aria-label="ZetaLog in one sentence">
        <h1 className="display hiw-hero__title">
          Every Zetamac game, recorded.
          <br />
          Every score, proven.
        </h1>
        <p className="hiw-hero__lede">
          ZetaLog is a Chrome extension and a leaderboard for UK university students. It records
          your games while you play, checks every score on the server and ranks verified personal
          bests.
        </p>
        <p className="hiw-hero__actions">
          <a href="#install" className="btn btn--primary">
            Install the extension
          </a>
          <Link href="/" className="btn btn--ghost">
            See the leaderboard
          </Link>
        </p>
      </section>

      <section className="hiw-steps" aria-label="The flow">
        <div className="hiw-step card card--pad">
          <span className="hiw-step__n num">1</span>
          <h2 className="hiw-step__title">Install and play</h2>
          <p className="meta">
            Add the extension, then play Zetamac as normal. Nothing changes about the game. Every
            round is recorded locally, signed in or not.
          </p>
        </div>
        <div className="hiw-step card card--pad">
          <span className="hiw-step__n num">2</span>
          <h2 className="hiw-step__title">Scores get checked</h2>
          <p className="meta">
            A score is never taken at face value. The server replays the recorded keystrokes,
            recomputes the score and runs it through statistical checks. Only clean games rank.
          </p>
        </div>
        <div className="hiw-step card card--pad">
          <span className="hiw-step__n num">3</span>
          <h2 className="hiw-step__title">Climb the boards</h2>
          <p className="meta">
            Link your account once and new games sync on their own. Verify a university email for
            its badge and board, or play independent on the global board.
          </p>
        </div>
      </section>

      <section className="hiw-split" aria-label="The extension">
        <div className="hiw-split__copy">
          <h2 className="display hiw-h2">The popup is your logbook</h2>
          <p className="meta">
            Latest score, personal bests per duration, a trend line and a focus hint that names the
            skill slowing you down. All computed from your own recorded games, on your machine.
          </p>
          <ul className="hiw-list meta">
            <li>Works without an account</li>
            <li>Restore or remove any game</li>
            <li>Flags capture problems instead of losing data</li>
          </ul>
        </div>
        <div className="hiw-popup card" aria-hidden="true">
          <div className="hiw-popup__head">
            <span className="hiw-popup__wordmark display">ZetaLog</span>
            <span className="hiw-popup__tag">Local</span>
          </div>
          <div className="hiw-popup__body">
            <span className="hiw-popup__label">Latest</span>
            <span className="hiw-popup__score num">47</span>
            <span className="hiw-popup__meta meta">Default · 120s · just now</span>
            <div className="hiw-popup__pbs">
              <span className="hiw-popup__pb">
                <span className="meta">30s</span>
                <span className="num">12</span>
              </span>
              <span className="hiw-popup__pb">
                <span className="meta">60s</span>
                <span className="num">27</span>
              </span>
              <span className="hiw-popup__pb">
                <span className="meta">120s</span>
                <span className="num">50</span>
              </span>
            </div>
            <svg className="hiw-popup__spark" viewBox="0 0 260 48" preserveAspectRatio="none">
              <polyline
                className="hiw-popup__line"
                points="0,38 24,36 48,39 72,30 96,33 120,26 144,28 168,22 192,24 216,14 240,12 260,8"
              />
            </svg>
            <span className="hiw-popup__focus meta">
              Focus: ÷ by 7 to 12. 3.2s median, 1.7× your fastest.
            </span>
          </div>
        </div>
      </section>

      <section className="hiw-split hiw-split--reverse" aria-label="Verification">
        <div className="hiw-split__copy">
          <h2 className="display hiw-h2">Cheating does not rank</h2>
          <p className="meta">
            The server rebuilds every game from its keystroke record. Impossible timings, pasted
            answers, fabricated streams and statistical outliers are caught before a score touches a
            board. Flagged games go to review, never silently deleted.
          </p>
        </div>
        <div className="hiw-split__copy">
          <h2 className="display hiw-h2">Your numbers, analysed</h2>
          <p className="meta">
            The progress page breaks solve times down by operation, times table and skill. It names
            the problems that cost you the most time, from real games only.
          </p>
        </div>
      </section>

      <section className="hiw-install card card--pad" id="install" aria-label="Install">
        <h2 className="display hiw-h2">Install the extension</h2>
        <p className="meta">
          ZetaLog is not on the Chrome Web Store yet. Loading it takes about a minute:
        </p>
        <ol className="hiw-ol">
          <li>
            Download the latest build from{' '}
            <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
              GitHub
            </a>{' '}
            and unzip it.
          </li>
          <li>
            Open <span className="num">chrome://extensions</span> and turn on Developer mode.
          </li>
          <li>Click Load unpacked and pick the unzipped folder.</li>
          <li>
            Play a round on{' '}
            <a href="https://arithmetic.zetamac.com" target="_blank" rel="noreferrer noopener">
              arithmetic.zetamac.com
            </a>
            . The popup shows your score.
          </li>
          <li>
            To rank, open <Link href="/signin">sign in</Link> and link the extension from the popup.
          </li>
        </ol>
      </section>
    </div>
  );
}
