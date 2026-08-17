import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { chromeWebStoreUrl } from '@/lib/chrome-store';

export const metadata: Metadata = {
  title: 'How ZetaLog works',
  description: 'Learn how to install ZetaLog, record Zetamac games and sync eligible scores.',
};

/** Static product page. There is no data to revalidate here. */
export const dynamic = 'force-static';

const ZETAMAC_URL = 'https://arithmetic.zetamac.com';
const MICROSOFT_QUARANTINE_URL = 'https://security.microsoft.com/quarantine';
const OFFICIAL_STORE_URL =
  'https://chromewebstore.google.com/detail/zetalog/bhbpjdngipckdepgblhopdfijnpeefml';
const EXTENSION_STORE_URL =
  chromeWebStoreUrl(process.env.NEXT_PUBLIC_CHROME_WEB_STORE_URL) ?? OFFICIAL_STORE_URL;

function StoreButton(): React.JSX.Element {
  return (
    <a
      href={EXTENSION_STORE_URL}
      target="_blank"
      rel="noreferrer noopener"
      className="hiw-store-button"
      aria-label="Add ZetaLog from the Chrome Web Store"
    >
      <Image src="/badges/chrome-reviewer.png" alt="" width={36} height={36} />
      <span>
        <strong>Add ZetaLog to Chrome</strong>
        <small>Chrome Web Store</small>
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
        <p className="hiw-label display">ZetaLog setup guide</p>
        <h1 className="display hiw-hero__title" id="hiw-title">
          Track your Zetamac scores
        </h1>
        <p className="hiw-hero__lede">
          ZetaLog is a Chrome extension that saves completed{' '}
          <a href={ZETAMAC_URL} target="_blank" rel="noreferrer noopener">
            Zetamac
          </a>{' '}
          games. Use it without an account for local score history. Link an account if you want to
          join the leaderboard.
        </p>
        <div className="hiw-hero__actions">
          <StoreButton />
          <a
            href={ZETAMAC_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn--ghost"
          >
            Open Zetamac
          </a>
        </div>
        <ul className="hiw-facts" aria-label="Key facts">
          <li>Free to use</li>
          <li>No account required</li>
          <li>Chrome updates it automatically</li>
        </ul>
      </section>

      <section className="hiw-overview" aria-labelledby="overview-title">
        <div className="hiw-section-heading">
          <p className="hiw-label display">What it does</p>
          <h2 className="display" id="overview-title">
            Play as normal. ZetaLog keeps the result.
          </h2>
        </div>
        <ol className="hiw-overview__steps">
          <li>
            <span className="hiw-overview__number num">1</span>
            <div>
              <h3>Play on Zetamac</h3>
              <p>Start a timed game and answer as many questions as you can.</p>
            </div>
          </li>
          <li>
            <span className="hiw-overview__number num">2</span>
            <div>
              <h3>Finish the game</h3>
              <p>ZetaLog records the score when the timer reaches zero.</p>
            </div>
          </li>
          <li>
            <span className="hiw-overview__number num">3</span>
            <div>
              <h3>Check your progress</h3>
              <p>Open the extension to see recent scores and personal bests.</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="hiw-section" id="install" aria-labelledby="install-title">
        <div className="hiw-section-heading">
          <p className="hiw-label display">Install and play</p>
          <h2 className="display" id="install-title">
            Record your first game
          </h2>
          <p>Follow these steps once. After that you can use Zetamac as normal.</p>
        </div>

        <ol className="hiw-guide">
          <li className="hiw-guide__step">
            <div className="hiw-guide__title">
              <span className="num">01</span>
              <h3>Install ZetaLog</h3>
            </div>
            <div className="hiw-guide__content">
              <p>
                Open the Store listing. Select <strong>Add to Chrome</strong> then confirm with{' '}
                <strong>Add extension</strong>. Chrome will install future updates for you.
              </p>
              <StoreButton />
              <div className="hiw-note">
                <strong>Want the icon to stay visible?</strong>
                <p>
                  Select Chrome&apos;s puzzle-piece icon. Find ZetaLog then select the pin beside
                  it. Pinning is optional and does not affect score recording.
                </p>
              </div>
            </div>
          </li>

          <li className="hiw-guide__step">
            <div className="hiw-guide__title">
              <span className="num">02</span>
              <h3>Open Zetamac</h3>
            </div>
            <div className="hiw-guide__content">
              <p>
                Open{' '}
                <a href={ZETAMAC_URL} target="_blank" rel="noreferrer noopener">
                  arithmetic.zetamac.com
                </a>
                . If the page was open before you installed ZetaLog, refresh it once.
              </p>
              <div className="hiw-new-user">
                <strong>New to Zetamac?</strong>
                <p>
                  Keep the default 120-second game. Select Start, type each answer then press Enter.
                  Your score is the number of correct answers before time runs out.
                </p>
              </div>
              <figure className="hiw-screen hiw-screen--game">
                <Image
                  src="/how-it-works/zetamac-game.jpg"
                  alt="A Zetamac game with the timer, score and answer field visible"
                  width={1280}
                  height={800}
                  sizes="(max-width: 760px) 92vw, 42rem"
                />
                <figcaption>This is the Zetamac page that ZetaLog reads.</figcaption>
              </figure>
            </div>
          </li>

          <li className="hiw-guide__step">
            <div className="hiw-guide__title">
              <span className="num">03</span>
              <h3>Finish and check the result</h3>
            </div>
            <div className="hiw-guide__content hiw-result">
              <div>
                <p>
                  Let the timer reach zero. Open ZetaLog from Chrome after the game ends. Your score
                  should appear under Latest and Recent.
                </p>
                <ul className="hiw-list">
                  <li>Latest score</li>
                  <li>Personal bests for each game length</li>
                  <li>Recent games and score trend</li>
                </ul>
                <p className="hiw-note hiw-note--plain">
                  Closing the tab or restarting before time runs out does not create a completed
                  result.
                </p>
              </div>
              <figure className="hiw-screen hiw-screen--popup">
                <Image
                  src="/how-it-works/extension-overview.png"
                  alt="The ZetaLog popup showing a latest score, personal bests and recent games"
                  width={360}
                  height={620}
                  sizes="(max-width: 560px) 62vw, 14rem"
                />
                <figcaption>Your history is stored in this browser.</figcaption>
              </figure>
            </div>
          </li>
        </ol>
      </section>

      <section className="hiw-section" id="sync" aria-labelledby="sync-title">
        <div className="hiw-section-heading">
          <p className="hiw-label display">Optional account link</p>
          <h2 className="display" id="sync-title">
            Sync scores to the leaderboard
          </h2>
          <p>
            You do not need an account for local tracking. Link the extension if you want eligible
            scores on the website leaderboard.
          </p>
        </div>

        <div className="hiw-sync card">
          <div className="hiw-sync__copy">
            <h3>Link this Chrome installation</h3>
            <ol>
              <li>Create an account or sign in to ZetaLog.</li>
              <li>
                Open the extension then select <strong>Sync to leaderboard</strong>.
              </li>
              <li>Complete the Chrome sign-in window if it appears.</li>
              <li>
                Return to the popup. Check for <strong>Linked to leaderboard</strong>.
              </li>
            </ol>
            <div className="hiw-sync__actions">
              <Link href="/signin" className="btn btn--ghost">
                Sign in
              </Link>
              <Link href="/link" className="btn btn--primary">
                Link extension
              </Link>
            </div>
          </div>
          <figure className="hiw-screen hiw-screen--sync">
            <Image
              src="/how-it-works/extension-sync.png"
              alt="The ZetaLog popup showing the Linked to leaderboard status"
              width={360}
              height={620}
              sizes="(max-width: 560px) 62vw, 14rem"
            />
            <figcaption>The status appears at the bottom of the popup.</figcaption>
          </figure>
        </div>

        <aside className="hiw-university card" aria-labelledby="university-title">
          <div className="hiw-university__intro">
            <p className="hiw-label display">Optional university badge</p>
            <h3 id="university-title">Verify your university email</h3>
            <p>
              If you attend a UK university, open your account and select{' '}
              <strong>Verify email</strong>. Enter the code sent to your student address. Your
              university mark will appear beside your name and you can join your university
              leaderboard.
            </p>
            <p>
              If you are not at university or prefer not to say, select that option in your account.
              You will stay on the global leaderboard without a badge. You can change the choice
              later.
            </p>
          </div>
          <div className="hiw-university__help">
            <h4>Code not received?</h4>
            <ol>
              <li>Check your junk or spam folder.</li>
              <li>
                For Microsoft or Outlook email, open the{' '}
                <a href={MICROSOFT_QUARANTINE_URL} target="_blank" rel="noreferrer noopener">
                  Microsoft quarantine page
                </a>
                . Find the ZetaLog email then select Release.
              </li>
              <li>Wait one minute then request a new code.</li>
            </ol>
          </div>
        </aside>
      </section>

      <section className="hiw-section hiw-help" aria-labelledby="help-title">
        <div className="hiw-section-heading">
          <p className="hiw-label display">Help</p>
          <h2 className="display" id="help-title">
            If something does not work
          </h2>
        </div>
        <div className="hiw-help__items">
          <details className="card">
            <summary>My first score did not appear</summary>
            <p>
              Refresh Zetamac once then complete a full game. Open the popup after the timer reaches
              zero. Restarted games and abandoned games are not recorded as completed results.
            </p>
          </details>
          <details className="card">
            <summary>What is uploaded?</summary>
            <p>
              Nothing is sent to your ZetaLog account until you link the extension. After linking,
              eligible game records are uploaded for validation. Read the{' '}
              <Link href="/privacy">privacy policy</Link> for the full data description.
            </p>
          </details>
        </div>
      </section>
    </div>
  );
}
