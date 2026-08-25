# Phase 8 and 9 release runbook

This is the final release gate for ZetaLog `1.0.0`. Phase 8 is complete only
when the protected CI run is green. Phase 9 is complete only when the owner has
performed the credentialled Chrome Web Store and production steps below. Never
substitute a locally rebuilt ZIP for the CI artifact.

## Phase 8 — automated verification

The `CI` workflow runs four required jobs. A branch must not be merged or
released unless all four pass:

1. `verify`: formatting, lint, type checking, all 900+ unit/integration tests,
   release-tool tests, inspection of the website's cache-busted secure download,
   a production dependency audit, and production builds.
2. `extension-e2e`: current source in real Chromium against the offline Zetamac
   replica.
3. `fullstack`: a fresh local Supabase stack, every migration, database lint,
   pgTAP, real website auth/dashboard E2E, and real extension link/upload E2E.
   `ZL_FULLSTACK=1` is mandatory in this job.
4. `release-artifact`: creates `1.0.0` once, inspects it, proves that its extracted
   payload matches the website download, loads the exact Store ZIP in Chromium,
   records SHA-256, and uploads the same Store bytes plus the checksum as a
   30-day CI artifact.

### Coverage map

| Release risk                                                                       | Automated proof                                                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Fresh schema and migrations                                                        | `fullstack` starts Supabase from an empty local stack                                |
| RLS, constraints, grants, alias integrity, atomic OAuth and erasure                | `supabase/tests/01` through `05` via pgTAP                                           |
| Website sign-up, code confirmation, sign-in, alias recovery and cookie persistence | `apps/web/e2e/auth.spec.ts` and `me.spec.ts`                                         |
| Real Chrome Identity/PKCE/credential-storage wiring                                | `apps/extension/e2e/link.spec.ts` in real Chromium                                   |
| Backend single-use code, challenge, upload and ranking                             | `apps/extension/e2e/fullstack.spec.ts` against local Supabase                        |
| Expired/revoked credential recovery and one-time relink                            | `apps/extension/lib/auth.test.ts` and `api.test.ts`                                  |
| Account A → unlink → account B isolation                                           | owner-filtered `sync.test.ts`, `store.test.ts`, plus full-stack unlink               |
| Parallel local saves and parallel server submissions                               | `store.test.ts` and the full-stack concurrent idempotency assertion                  |
| Navigation, refresh, tab close and BFCache                                         | `wiring.test.ts` plus the real-navigation replica E2E                                |
| Oversized/malformed telemetry                                                      | shared schema tests, route byte-limit tests, and full-stack 413 assertion            |
| Parallel verification-email reservations                                           | full-stack concurrent `reserve_uni_verification` assertion                           |
| Challenge forgery/replay and client-authored scores                                | shared judgement tests, pgTAP PKCE replay, and full-stack challenge replay assertion |
| Remove and restore                                                                 | extension store/sync tests and full-stack server lifecycle                           |
| Complete account deletion and 30-day anonymous-event retention                     | account-route tests, pgTAP, and full-stack erasure                                   |
| Apex canonical redirect                                                            | real Next.js host-header E2E                                                         |
| ZIP secrets, dev URLs, maps, remote code, permissions and manifest                 | `scripts/inspect-extension-zip.mjs` and exact-ZIP Chromium test                      |
| Website beta download drifting from the Store candidate                            | extracted-payload comparison in `release-artifact`                                   |

After CI passes, download `zetalog-extension-1.0.0-<commit SHA>` from that run.
Run the inspector locally and compare its printed checksum to the included
`.sha256` file. If either differs, stop.

### Existing beta-install transition — approved

The beta website distributed an unpacked ZIP. Chrome does not auto-update an
unpacked extension from the Web Store, and a Store item cannot read another
extension ID's `chrome.storage.local`. The owner has therefore approved this
one-time transition after the Store listing is publicly installable:

1. Ask the beta user to open the old extension and let every pending upload finish.
2. Install the Store item and link it once.
3. Confirm that previously uploaded account history has backfilled.
4. Uninstall the old unpacked copy.

The website announcement and instructions must state that an unsynced game held
only in the old extension's local storage cannot transfer after that copy is
removed. Do not claim that unpacked installations upgrade silently. The
legacy-protocol cutoff only limits how long the compatible endpoint remains
available; it does not move local storage between extension IDs.

## Phase 9 — controlled Store and production release

### 1. Freeze ownership and version

- [ ] Confirm in the Chrome Web Store dashboard that **no `1.0.0` ZIP has ever
      been uploaded**. Chrome will not accept a replacement with the same
      version. If one exists, stop and choose the next version everywhere.
- [ ] Freeze one reviewed commit. Record its commit SHA, CI run URL, ZIP SHA-256,
      database migration list, and intended Vercel deployment.
- [ ] Protect `main` so `verify`, `extension-e2e`, `fullstack`, and
      `release-artifact` are required and cannot be bypassed by one person.
- [ ] Enable GitHub private vulnerability reporting and secret scanning.

### 2. Establish the publisher account

- [ ] Use an organisation-controlled Google account, not a personal account;
      enable phishing-resistant 2FA and store recovery codes in the organisation
      password manager.
- [ ] Pay Google's one-time developer registration fee.
- [ ] Add a second trusted owner/admin so loss of one account cannot strand the
      extension.
- [ ] Verify `zetalog.co.uk` in Google Search Console using the same organisation
      and complete any Chrome Web Store trader/contact declarations that apply.

### 3. Create the draft and configure the exact callback

- [ ] Upload the CI ZIP as a **draft only**. Do not rebuild it. Copy the permanent
      32-character extension ID assigned by Google.
- [ ] Set `EXTENSION_OAUTH_REDIRECT_URIS` in staging to exactly
      `https://<extension-id>.chromiumapp.org/zetalog-link`; wildcards and
      additional origins are forbidden.
- [ ] Set `NEXT_PUBLIC_CHROME_WEB_STORE_URL` in staging to the final listing URL
      containing that same ID. Prepare the equivalent production deployment,
      but do not promote it while the Store item is still private.
- [ ] In the fully populated staging environment run `pnpm release:check-env`.
      It validates presence and callback shape without printing secret values.
- [ ] Deploy the server/migrations to staging and install the exact draft ZIP in
      a clean Chrome profile. Test capture, browser restart, link, independent
      session use, forced revocation/relink, offline replay, remove/restore,
      account switching, account deletion, and uninstall.

### 4. Database and production preflight

- [ ] Confirm Supabase backups/PITR are enabled and record a restore point before
      applying migrations. Confirm the Cron integration (`pg_cron`) is available.
- [ ] Apply migrations to staging first; run pgTAP and verify the
      `zetalog-operational-data-retention` job calls
      `public.purge_expired_operational_data()` successfully.
- [ ] Configure the exact callback in production. Apply the already-tested
      additive migrations, then deploy the website/API support. Do not expose a
      private Store URL or publish the extension yet.
- [ ] Build and verify a production website deployment containing the final Store
      URL, but leave it unpromoted until the listing is publicly installable.
- [ ] Confirm apex → `www` redirect, privacy policy, sign-in/recovery, link,
      challenge, submit, backfill, remove/restore, erasure, and the cron job in
      production using test-owned accounts only.

### 5. Listing and reviewer submission

- [ ] Use the copy and permission/data justifications in
      `docs/store/listing.md`, the live `/privacy` policy, the 128px icon, and
      five current 1280×800 screenshots.
- [ ] Disclose authentication identifiers, website content needed to record the
      game, and game activity exactly as described. Do not claim that cheating
      is impossible or that no data is processed.
- [ ] Give the reviewer a test account and concise instructions: install, sign
      in on the website, choose Link once, play a normal Zetamac game, and open
      the popup. Revoke the test account after review.
- [ ] Submit with **deferred publishing**. Once approved, repeat the clean-profile
      test on the exact approved artifact and verify its version/checksum record.

### 6. Publish, observe, and roll back safely

- [ ] Publish `1.0.0` gradually if the dashboard offers staged rollout.
- [ ] Confirm the listing works in a signed-out clean profile, then immediately
      promote the prepared website deployment and publish the approved beta-user
      announcement and transition instructions.
- [ ] Create provider-side alerts before publishing: Vercel API 5xx above 2% for
      five minutes; Supabase database/API errors above baseline; Auth 5xx or
      token failures above 2%; connection/storage saturation above 80%; and a
      missing/failed retention cron execution for more than two hours.
- [ ] Monitor aggregate provider metrics only. Do not add identifiable game or
      extension telemetry; the agreed privacy design retains only anonymous
      security events for 30 days.
- [ ] For an extension-only fault, pause rollout/unpublish and keep the compatible
      server live. For a web fault, roll Vercel back to the frozen deployment.
      Migrations are additive: prefer a forward fix; do not run an improvised
      down-migration. If data integrity is affected, stop writes and use the
      recorded Supabase restore point. Account deletion is intentionally
      irreversible.
- [ ] Keep the legacy migration endpoint until its documented UTC cutoff for any
      still-running beta installation. Different-ID beta users follow the
      approved one-time Store transition above.

The final release record must contain: Store item ID and URL, version, commit,
all four green CI jobs, artifact name, SHA-256, migration/backup evidence,
production deployment IDs, callback URL, clean-profile test result, approval
timestamp, publication timestamp, beta-transition decision/evidence, and the
named incident owner.
