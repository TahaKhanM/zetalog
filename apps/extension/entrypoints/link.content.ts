import { browser, defineContentScript } from '#imports';

import { LINK_ORIGINS } from '../lib/config.js';
import { LINK_ACK, parseLinkMessage } from '../lib/link.js';
import { type BgRequest, type BgResponse } from '../lib/messages.js';

/**
 * Account-link handoff receiver (brief "Session handoff"). The browser runs this
 * script ONLY on our own `/link` origins, so it — and therefore the extension it
 * belongs to — is the guaranteed recipient of the session the page posts. No
 * extension id ever appears in a URL and the token can reach no other recipient.
 *
 * On an explicit user click the page posts `{ type: 'zl-link', session }`; this
 * script validates the origin AND that the message came from the page's own
 * window (`event.source === window`) before reading anything, forwards the
 * tokens to the background, and — only once the background confirms it stored
 * the session — posts `zl-link-ack` back to the validated origin so the page can
 * show "Linked". It adds no new permissions: content-script matches only.
 *
 * The localhost match exists for local development ONLY — the wxt.config.ts
 * `build:manifest:generated` hook strips it from every non-development build,
 * so the published extension ships the production origin alone.
 */
export default defineContentScript({
  matches: ['https://www.zetalog.co.uk/link*', 'http://localhost:3000/link*'],
  main() {
    window.addEventListener('message', (event) => {
      const parsed = parseLinkMessage(event, window, LINK_ORIGINS);
      if (!parsed.ok) return;

      const request: BgRequest = {
        type: 'zl-link',
        accessToken: parsed.value.accessToken,
        refreshToken: parsed.value.refreshToken,
      };
      void browser.runtime.sendMessage(request).then((response) => {
        if ((response as BgResponse | undefined)?.ok) {
          window.postMessage(LINK_ACK, event.origin);
        }
      });
    });
  },
});
