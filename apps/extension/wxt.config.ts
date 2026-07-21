import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ZetaLog',
    description: 'Frictionless score tracking and progress graphs for Zetamac.',
    // `alarms` powers the background sync-retry drain (exponential backoff); the
    // content-script origins (Zetamac + the /link pages) are declared per
    // entrypoint, so no host_permissions are needed.
    permissions: ['storage', 'alarms'],
    icons: {
      16: '/icon-16.png',
      32: '/icon-32.png',
      48: '/icon-48.png',
      96: '/icon-96.png',
      128: '/icon-128.png',
    },
  },
  hooks: {
    // The link content script declares a localhost match so the account-link
    // handoff is testable against a local web app (`wxt dev` / `wxt build
    // --mode development`). The PUBLISHED build must ship only the production
    // origin, so every localhost match is stripped from the generated manifest
    // outside development mode.
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.mode === 'development') return;
      for (const script of manifest.content_scripts ?? []) {
        script.matches = (script.matches ?? []).filter((match) => !match.includes('//localhost'));
      }
    },
  },
});
