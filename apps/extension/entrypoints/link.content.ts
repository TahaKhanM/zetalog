import { browser, defineContentScript } from '#imports';

import { type BgRequest, type BgResponse } from '../lib/messages.js';

/**
 * Account-link entry point. A stable button marker and an actual browser click
 * prevent a page script from opening an interactive identity window. The
 * background then owns the PKCE verifier, state, Chrome identity redirect, and
 * opaque credential exchange. No credential, authorization code, or PKCE
 * material crosses the page/content-script boundary.
 *
 * The localhost match exists for local development ONLY — the wxt.config.ts
 * `build:manifest:generated` hook strips it from every non-development build,
 * so the published extension ships the production origin alone.
 */
export default defineContentScript({
  matches: import.meta.env.DEV
    ? ['https://www.zetalog.co.uk/link*', 'http://localhost:3000/link*']
    : ['https://www.zetalog.co.uk/link*'],
  main() {
    const button = document.querySelector<HTMLButtonElement>('[data-zetalog-link-button]');
    if (button === null) return;
    button.addEventListener('click', (event: MouseEvent) => {
      if (!event.isTrusted) return;
      const request: BgRequest = { type: 'zl-begin-link' };
      void browser.runtime.sendMessage(request).then((response: unknown) => {
        const result = response as BgResponse | undefined;
        window.postMessage(
          { type: result?.ok === true ? 'zl-link-complete' : 'zl-link-failed' },
          window.location.origin,
        );
      });
    });
  },
});
