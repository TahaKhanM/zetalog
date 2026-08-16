import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How it works',
  description: 'Track your Zetamac scores and compare them with players worldwide.',
};

/** Static product page. There is no data to revalidate here. */
export const dynamic = 'force-static';

const GITHUB_URL = 'https://github.com/TahaKhanM/zetalog';
const ZETAMAC_URL = 'https://arithmetic.zetamac.com';

/**
 * `/how-it-works` (CO-12): a concise product tour for a first-time visitor.
 * What ZetaLog is, how the extension records and links, and how badges work.
 * The popup preview is a theme-following CSS replica, not a screenshot.
 */
export default function HowItWorksPage(): React.JSX.Element {
  return (
    <div className="hiw board-enter">
      <section className="hiw-hero" aria-label="What ZetaLog is">
        <p className="hiw-hero__eyebrow display">How it works</p>
        <h1 className="display hiw-hero__title">Track your Zetamac scores. Compare worldwide.</h1>
        <p className="hiw-hero__lede">
          Zetamac is the mental arithmetic game people use to build speed for quant interviews.
          ZetaLog is a Chrome extension that records every game you play and a leaderboard that
          ranks your best against players around the world.
        </p>
        <p className="hiw-hero__actions">
          <a href="#install" className="btn btn--primary">
            Get the extension
          </a>
          <Link href="/" className="btn btn--ghost">
            See the leaderboard
          </Link>
        </p>
      </section>

      <section className="hiw-split" aria-label="What the extension does">
        <div className="hiw-split__copy">
          <h2 className="display hiw-h2">The extension is your logbook</h2>
          <p className="meta">
            Install it and play Zetamac as normal. Nothing about the game changes. Every round is
            recorded on your machine and shown in the popup.
          </p>
          <ul className="hiw-list">
            <li>Works straight away, no account needed.</li>
            <li>Your latest score and a trend line as you improve.</li>
            <li>Your best score at 30s, 60s and 120s.</li>
            <li>A focus hint that names the skill slowing you down.</li>
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

      <section className="hiw-steps" aria-label="Getting on the leaderboard">
        <div className="hiw-step card card--pad">
          <span className="hiw-step__n num">1</span>
          <h2 className="hiw-step__title">Install and play</h2>
          <p className="meta">
            Add the extension to Chrome, then play a game on{' '}
            <a href={ZETAMAC_URL} target="_blank" rel="noreferrer noopener">
              Zetamac
            </a>
            . The popup fills with your scores right away.
          </p>
        </div>
        <div className="hiw-step card card--pad">
          <span className="hiw-step__n num">2</span>
          <h2 className="hiw-step__title">Link your account</h2>
          <p className="meta">
            Your games stay on your machine until you connect them. Make a free account, open the
            popup and press Sync to leaderboard. That links this browser once, and every new game
            uploads on its own from then on.
          </p>
        </div>
        <div className="hiw-step card card--pad">
          <span className="hiw-step__n num">3</span>
          <h2 className="hiw-step__title">Rank worldwide</h2>
          <p className="meta">
            Your best score at each duration appears on the global board next to your display name.
            Beat it and the board updates on its own.
          </p>
        </div>
      </section>

      <section className="hiw-split hiw-split--reverse" aria-label="University badges">
        <div className="hiw-split__copy">
          <h2 className="display hiw-h2">Add a university badge</h2>
          <p className="meta">
            At a UK university? Verify your student email to show your university mark next to your
            name and unlock a board for your university alone.
          </p>
          <ol className="hiw-mini-ol">
            <li>Open your account and choose Verify email.</li>
            <li>Enter your university email and the code we send it.</li>
            <li>Your badge shows everywhere your name appears.</li>
          </ol>
          <p className="meta hiw-note">
            Not at a university, or would rather not say? Pick that in your account. You stay on the
            global board with no badge, and can change it any time.
          </p>
        </div>
        <div className="hiw-split__copy">
          <h2 className="display hiw-h2">Your numbers, analysed</h2>
          <p className="meta">
            The progress page turns your games into a clear read on where to improve:
          </p>
          <ul className="hiw-list">
            <li>Solve times broken down by operation and times table.</li>
            <li>The skills that cost you the most time.</li>
            <li>The specific problems you are slowest on.</li>
          </ul>
          <p className="hiw-inline-link">
            <Link href="/me" className="btn btn--ghost btn--sm">
              See my progress
            </Link>
          </p>
        </div>
      </section>

      <section className="hiw-install card card--pad" id="install" aria-label="Install">
        <h2 className="display hiw-h2">Install the extension</h2>
        <p className="meta">
          ZetaLog is not on the Chrome Web Store yet. Loading it by hand takes about a minute.
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
            Open <span className="num">chrome://extensions</span> and turn on Developer mode, top
            right.
          </li>
          <li>Press Load unpacked and pick the unzipped folder.</li>
          <li>
            Play a game on{' '}
            <a href={ZETAMAC_URL} target="_blank" rel="noreferrer noopener">
              Zetamac
            </a>{' '}
            and open the popup to see your score.
          </li>
          <li>
            To rank, <Link href="/signin">make an account</Link> and press Sync to leaderboard in
            the popup.
          </li>
        </ol>
      </section>
    </div>
  );
}
