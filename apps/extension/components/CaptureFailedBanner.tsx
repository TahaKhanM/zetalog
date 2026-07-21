import type { JSX } from 'react';

/**
 * The cream-on-maroon strip shown when any `capture_failed` record exists —
 * the recorder hit Zetamac DOM drift and some games may be missing. Data is
 * never silently lost; this banner is how the loss surfaces (spec §3.1, §9).
 */
export function CaptureFailedBanner(): JSX.Element {
  return (
    <div className="zl-banner" role="status">
      <span className="zl-banner__dot" />
      <span>Recorder needs an update — recent games may be missing.</span>
    </div>
  );
}
