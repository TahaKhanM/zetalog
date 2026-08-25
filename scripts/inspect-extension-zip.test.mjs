import assert from 'node:assert/strict';
import test from 'node:test';

import { RELEASE_VERSION, textViolations, validateManifest } from './inspect-extension-zip.mjs';

const requiredEntries = new Set([
  'manifest.json',
  'background.js',
  'popup.html',
  'icon-16.png',
  'icon-32.png',
  'icon-48.png',
  'icon-96.png',
  'icon-128.png',
  'content-scripts/link.js',
  'content-scripts/zetamac.js',
]);

function manifest() {
  return {
    action: { default_popup: 'popup.html' },
    background: { service_worker: 'background.js' },
    content_scripts: [
      { js: ['content-scripts/link.js'], matches: ['https://www.zetalog.co.uk/link*'] },
      { js: ['content-scripts/zetamac.js'], matches: ['https://arithmetic.zetamac.com/*'] },
    ],
    description: 'Track your Zetamac scores and compare them on a worldwide leaderboard.',
    icons: {
      16: '/icon-16.png',
      32: '/icon-32.png',
      48: '/icon-48.png',
      96: '/icon-96.png',
      128: '/icon-128.png',
    },
    manifest_version: 3,
    minimum_chrome_version: '116',
    name: 'ZetaLog',
    permissions: ['storage', 'alarms', 'unlimitedStorage', 'identity'],
    version: RELEASE_VERSION,
  };
}

test('accepts the intended production manifest contract', () => {
  assert.deepEqual(validateManifest(manifest(), requiredEntries), []);
});

test('rejects a version downgrade and an extra host permission', () => {
  const candidate = manifest();
  candidate.version = '1.1.0';
  candidate.host_permissions = ['https://example.test/*'];
  candidate.content_scripts[1].matches.push('http://localhost:3000/*');

  assert.deepEqual(validateManifest(candidate, requiredEntries), [
    'manifest version must be 1.0.0, got 1.1.0',
    'unexpected manifest fields: action, background, content_scripts, description, host_permissions, icons, manifest_version, minimum_chrome_version, name, permissions, version',
    'unexpected host permissions: https://example.test/*',
    'unexpected content-script matches: http://localhost:3000/*, https://arithmetic.zetamac.com/*, https://www.zetalog.co.uk/link*',
  ]);
});

test('detects development URLs, remote executable code, and private-key signatures', () => {
  assert.deepEqual(textViolations('background.js', 'fetch("http://localhost:3000")'), [
    'background.js: development URL or runtime marker',
  ]);
  assert.deepEqual(
    textViolations('popup.html', '<script src="https://example.test/code.js"></script>'),
    ['popup.html: remotely hosted executable code'],
  );
  assert.deepEqual(textViolations('background.js', '-----BEGIN PRIVATE KEY-----'), [
    'background.js: private credential signature',
  ]);
});
