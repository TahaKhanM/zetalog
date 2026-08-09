# Extension release artifact inspection

This is the repeatable ZIP gate for Phase 8. It checks the exact extension
archive intended for upload before anyone opens the Chrome Web Store dashboard.
It does not replace browser smoke testing, database tests, or the Store's own
review.

From the repository root, after the extension has been built and zipped:

```bash
node scripts/inspect-extension-zip.mjs apps/extension/.output/zetalogextension-1.0.0-chrome.zip
```

The command exits non-zero unless the archive is valid, is bounded in size,
contains the required manifest/code/icon files, has genuine PNG icons, and has
the release contract below:

- Manifest V3 and version `1.0.0`.
- Only the expected permissions and content-script hosts.
- No `localhost`, loopback address, development-runtime marker, source map,
  source/test/env file, or `node_modules` path.
- No static remote executable-code loader or common private-key/service-key
  signature in a text asset.
- No unsafe archive paths, duplicate paths, or unexpectedly large archive.

On success it prints the SHA-256 checksum. Record that checksum with the ZIP
and upload that same file; rebuilding after approval produces a different,
untested artifact.

The script uses Node's standard library and the platform `unzip` command, which
is installed on the supported macOS and Ubuntu release environments. Its
focused contract test can be run without any application services:

```bash
node --test scripts/inspect-extension-zip.test.mjs
```

The known Supabase publishable key is not treated as a secret because it is
intended to be public; database RLS and the independent extension credential
are the protection boundary. A service-role key, private key, or a remotely
loaded script is rejected.
