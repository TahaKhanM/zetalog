import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How it works',
  description: 'Track your Zetamac scores and compare them with players worldwide.',
};

/** Static product page. There is no data to revalidate here. */
export const dynamic = 'force-static';

const ZETAMAC_URL = 'https://arithmetic.zetamac.com';
const EXTENSION_ZIP = '/zetalog-chrome-1.0.0.zip';
const EXTENSION_VERSION = '1.0.0';

function DownloadIcon(): React.JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderGlyph(): React.JSX.Element {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function PuzzleGlyph(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 3a2 2 0 0 1 4 0v1h3a1 1 0 0 1 1 1v3h1a2 2 0 1 1 0 4h-1v3a1 1 0 0 1-1 1h-3v1a2 2 0 1 1-4 0v-1H6a1 1 0 0 1-1-1v-3H4a2 2 0 1 1 0-4h1V5a1 1 0 0 1 1-1h4V3Z"
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * `/how-it-works`: a concise product tour for a first-time visitor.
 * What ZetaLog is, how the extension records and links, and how badges work.
 * The popup and browser mockups are theme-following CSS, not screenshots.
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

      <section className="hiw-install" id="install" aria-label="Install">
        <div className="hiw-download card card--pad">
          <div>
            <h2 className="display hiw-h2">Add ZetaLog to Chrome</h2>
            <p className="meta hiw-download__lede">
              Not on the Chrome Web Store yet. Download the build and load it in about a minute. It
              works in Chrome, Edge and Brave.
            </p>
          </div>
          <div className="hiw-download__cta">
            <a href={EXTENSION_ZIP} download className="btn btn--primary hiw-download__btn">
              <DownloadIcon /> Download for Chrome
            </a>
            <span className="meta hiw-download__meta num">v{EXTENSION_VERSION} · 680 KB</span>
          </div>
        </div>

        <ol className="walk" aria-label="How to load the extension">
          <li className="walk-step">
            <div className="walk-step__copy">
              <span className="walk-step__n num">1</span>
              <h3 className="walk-step__title">Unzip the download</h3>
              <p className="meta">
                Double-click the file. You get a folder called zetalog-chrome. Keep it somewhere you
                will not delete by accident.
              </p>
            </div>
            <div className="walk-art walk-art--unzip" aria-hidden="true">
              <span className="mock-zip num">ZIP</span>
              <span className="mock-into">→</span>
              <span className="mock-folder">
                <FolderGlyph />
                <span className="num">zetalog-chrome</span>
              </span>
            </div>
          </li>

          <li className="walk-step">
            <div className="walk-step__copy">
              <span className="walk-step__n num">2</span>
              <h3 className="walk-step__title">Open the extensions page</h3>
              <p className="meta">
                In Chrome, type <span className="num">chrome://extensions</span> into the address
                bar and press Enter.
              </p>
            </div>
            <div className="walk-art" aria-hidden="true">
              <div className="chrome-frame">
                <div className="chrome-frame__bar">
                  <span className="chrome-frame__dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="chrome-frame__omni num">chrome://extensions</span>
                </div>
              </div>
            </div>
          </li>

          <li className="walk-step">
            <div className="walk-step__copy">
              <span className="walk-step__n num">3</span>
              <h3 className="walk-step__title">Turn on Developer mode</h3>
              <p className="meta">
                Flip the Developer mode switch in the top-right corner of the page. Three buttons
                appear.
              </p>
            </div>
            <div className="walk-art" aria-hidden="true">
              <div className="chrome-frame">
                <div className="chrome-frame__head">
                  <span className="chrome-frame__title display">Extensions</span>
                  <span className="mock-dev">
                    <span className="meta">Developer mode</span>
                    <span className="mock-switch mock-switch--on">
                      <span className="mock-switch__thumb" />
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </li>

          <li className="walk-step">
            <div className="walk-step__copy">
              <span className="walk-step__n num">4</span>
              <h3 className="walk-step__title">Load unpacked</h3>
              <p className="meta">
                Click Load unpacked, then choose the zetalog-chrome folder you unzipped in step one.
              </p>
            </div>
            <div className="walk-art" aria-hidden="true">
              <div className="chrome-frame">
                <div className="chrome-frame__actions">
                  <span className="mock-btn mock-btn--on">Load unpacked</span>
                  <span className="mock-btn">Pack extension</span>
                  <span className="mock-btn">Update</span>
                </div>
              </div>
            </div>
          </li>

          <li className="walk-step">
            <div className="walk-step__copy">
              <span className="walk-step__n num">5</span>
              <h3 className="walk-step__title">Pin it and play</h3>
              <p className="meta">
                Open the puzzle icon and pin ZetaLog to your toolbar. Play a game on{' '}
                <a href={ZETAMAC_URL} target="_blank" rel="noreferrer noopener">
                  Zetamac
                </a>{' '}
                and click the icon to see your score.
              </p>
            </div>
            <div className="walk-art" aria-hidden="true">
              <div className="chrome-frame">
                <div className="chrome-frame__toolbar">
                  <span className="chrome-frame__omni chrome-frame__omni--sm num">
                    arithmetic.zetamac.com
                  </span>
                  <span className="mock-tool">
                    <PuzzleGlyph />
                  </span>
                  <span className="mock-tool mock-tool--pinned">
                    <img src="/icon-96.png" alt="" width={18} height={18} />
                  </span>
                </div>
              </div>
            </div>
          </li>
        </ol>

        <p className="hiw-install__foot meta">
          Want to rank on the leaderboard? <Link href="/signin">Make an account</Link>, then press
          Sync to leaderboard in the popup. Prefer to review the source first? It is on{' '}
          <a href="https://github.com/TahaKhanM/zetalog" target="_blank" rel="noreferrer noopener">
            GitHub
          </a>
          .
        </p>
      </section>
    </div>
  );
}
