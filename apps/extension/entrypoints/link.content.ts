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
    const announce = (): void => {
      window.postMessage({ type: 'zl-extension-ready' }, window.location.origin);
    };
    window.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== window) return;
      if (
        typeof event.data === 'object' &&
        event.data !== null &&
        (event.data as { type?: unknown }).type === 'zl-extension-ping'
      ) {
        announce();
      }
    });
    announce();

    const button = document.querySelector<HTMLButtonElement>('[data-zetalog-link-button]');
    if (button === null) return;
    button.addEventListener('click', (event: MouseEvent) => {
      if (!event.isTrusted) return;
      const request: BgRequest = { type: 'zl-begin-link' };
      void browser.runtime
        .sendMessage(request)
        .then((response: unknown) => {
          const result = response as BgResponse | undefined;
          window.postMessage(
            result?.ok === true
              ? { type: 'zl-link-complete', syncPending: result.syncPending === true }
              : { type: 'zl-link-failed', error: result?.error ?? 'internal' },
            window.location.origin,
          );
        })
        .catch(() => {
          window.postMessage({ type: 'zl-link-failed', error: 'internal' }, window.location.origin);
        });
    });
  },
});
