import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How it works',
  description: 'Download the ZetaLog extension and load it into Chrome in about a minute.',
};

/** Static product page. There is no data to revalidate here. */
export const dynamic = 'force-static';

const ZETAMAC_URL = 'https://arithmetic.zetamac.com';
const GITHUB_URL = 'https://github.com/TahaKhanM/zetalog';
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
 * `/how-it-works`: get the extension and load it. The download and the
 * step-by-step install are the whole point of the page; the Chrome mockups
 * are theme-following CSS, not screenshots.
 */
export default function HowItWorksPage(): React.JSX.Element {
  return (
    <div className="hiw board-enter">
      <section className="hiw-hero" aria-label="Get ZetaLog">
        <p className="hiw-hero__eyebrow display">Get ZetaLog</p>
        <h1 className="display hiw-hero__title">Add the extension in about a minute.</h1>
        <p className="hiw-hero__lede">
          ZetaLog records every Zetamac game you play and ranks your best against players worldwide.
          It is not on the Chrome Web Store yet, so you load it by hand once.
        </p>
        <p className="hiw-hero__actions">
          <a href={EXTENSION_ZIP} download className="btn btn--primary hiw-download__btn">
            <DownloadIcon /> Download for Chrome
          </a>
          <a href="#install" className="btn btn--ghost">
            How to load it
          </a>
        </p>
        <p className="hiw-hero__note meta">
          <span className="num">v{EXTENSION_VERSION} · 680 KB</span> · Chrome, Edge and Brave
        </p>
      </section>

      <section className="hiw-install" id="install" aria-label="Install">
        <h2 className="display hiw-install__title">Load it into Chrome</h2>
        <p className="meta hiw-install__intro">
          Download the file above, then follow these five steps.
        </p>

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
          Scores are yours alone until you connect them. To rank on the leaderboard,{' '}
          <Link href="/signin">make an account</Link> and press Sync to leaderboard in the popup. At
          a UK university? Verify your student email in your account to add a badge. The source is
          on{' '}
          <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener">
            GitHub
          </a>
          .
        </p>
      </section>
    </div>
  );
}
