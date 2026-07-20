export default defineContentScript({
  matches: ['*://arithmetic.zetamac.com/*'],
  main() {
    // Recorder is implemented in Plan 2 (W1); this entrypoint stays thin.
  },
});
