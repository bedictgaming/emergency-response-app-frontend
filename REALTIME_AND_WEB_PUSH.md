# Development candidate: Socket.IO, reference cache and admin Web Push

This source update is for `development`, paired with the matching backend candidate. A source push is not a live deployment or approval to renew audit exceptions/change production configuration. The workspace's `MASTER_PROMPT.md` remains the canonical engineering reference.

## Transport and cache

`src/lib/emergencyTransport.ts` selects Socket.IO in ordinary Next development; production keeps SSE by default. `NEXT_PUBLIC_EMERGENCY_TRANSPORT=socket.io|sse` explicitly selects a transport at build time. Socket.IO uses WebSocket-only `/api/events/v1/socket.io`; there is no hidden polling fallback. Existing account-isolated shared streams, reconnect/backoff, lifecycle catch-up reads and permission/session boundaries are retained.

The backend must support the selected transport and preserve its authenticated gateway upgrade boundary. Never bypass the gateway or place tokens in query strings. Events invalidate fresh authorized HTTP reads; no zero-latency, exactly-once or multi-replica replay guarantee is made.

Only the public barangay reference list is cached for 60 seconds in document memory. Reads are coalesced/cloned, errors are not cached as empty success, and `getBarangays({fresh:true})` invalidates it. Private reports, evidence, credentials, sessions and permissions are not cached. Submission still validates current references on the server.

## Admin notification controls

The shared admin header has Background notifications for Main and all four departments. On the owner's explicit refinement request, the first visible server-verified admin visit automatically attempts the native browser Allow/Block permission request. It does not ask on public/login/citizen/unauthorized pages. This is a request, never automatic consent: browsers can suppress or refuse prompts without a user gesture. A visible Enable notifications fallback remains for those browsers. Already granted permission automatically registers without another prompt. Registration is bound to the current account/logout identity and must persist through the authenticated API before success is shown. Missing configuration, worker disabled, denied permission, failed registration and unavailable service worker remain distinct recoverable states.

Only a non-private origin-wide attempted marker (`emergency-admin-push-prompt-v1`) is persisted, before requesting consent. Dismissal, denial, reload, remount and account switches must not repeatedly prompt. A hidden tab waits for visibility; blocked marker storage skips the automatic attempt and leaves explicit opt-in available. Normal development without push enabled, unsupported and insecure contexts do not request permission or consume the marker. Browser permission rejection does not fetch keys, subscribe or register; subsequent configuration/persistence failures remain visible errors. Automatic/manual requests for the same account/logout snapshot share pending registration work.

Show device test requests a local native notification display only. It is not a server-send, provider acceptance or closed-tab delivery test. Actual OS sound/DND, internet, browser lifetime and phone battery restrictions can suppress/delay notifications. Closing a tab is different from Logout or force-stopping the browser.

## Local development opt-in

- Set `NEXT_PUBLIC_API_URL=http://localhost:8000` and `NEXT_PUBLIC_ENABLE_DEV_PUSH=true` only for a controlled loopback test with the matching backend, separately approved synthetic database and fresh development VAPID keys. Never put a private key in frontend variables or Git.
- The explicit loopback mode registers `/sw.js?pushOnly=1&apiOrigin=...`. It never intercepts/caches development assets/API calls. Authenticated relevance requests allow only the same hostname/protocol on API port 8000, with no credentials/path/query override.
- Normal development without that flag continues unregistering service workers/app shell caches to avoid stale assets. Protected validation continues disabling push. Production always uses its first-party API gateway.
- A Git checkout does not automatically enable the backend worker or replace the owner's primary demo runtime. The owner's isolated local operator/private configuration is intentionally not in this source commit.

Use separate normal browser profiles/devices for simultaneously subscribed Main and department accounts. On each: sign in and respond to the browser notification prompt; if the browser suppresses it, choose Enable notifications, then Allow. Wait for Registered before closing the site tab without logging out. Submit one synthetic Medical report from a separate citizen session and record whether Main and Medical actually receive the hint while other departments do not. Repeat bounded tests for the other services. An Android phone's localhost is not the laptop; plain LAN HTTP does not qualify for phone push. A separately authorized reachable HTTPS environment is needed. A local source refinement is not automatically a live deployment.

## Test boundaries and release hold

Local automatic-permission refinement (not yet committed/pushed/deployed): 31 registration/worker contracts, 27 architecture/deployment/audit-policy contracts, TypeScript, scoped ESLint, whitespace checks and a fresh eighteen-route Next build pass. The final browser run passes 26 cases without retries; the native-device display gate is explicitly skipped. All five automatic admin requests, dismissed/denied consent, gesture-only fallback, authoritative session denial, configuration/persistence failures and existing siren/queue/background-worker/network regressions are covered. Browser permission and API/provider/OS responses are synthetic; real Android native prompt appearance and delivery remain unverified. Desktop/mobile fallback captures are inspected and the mechanical design detector reports no findings.

Preserve the first browser run's fallback-fixture failure: navigation automation retains browser activation, allowing the simulated automatic request. The fixture alone is corrected to refuse the first request deterministically, then require real click activation for its manual retry. Required states, app code and global timeout/retry policy remain unchanged; exact runtime hashes still match the successful export. The separate local backend remains running; only the stopped matching frontend is started again. A cold-render startup timeout is retained, followed by a successful unchanged runtime check, without a second start. The earlier live release/CI evidence below does not certify publication of this refinement.

`npm run test:realtime`, `npm run test:push` and `npm run test:worker` exercise transport/cache/registration/worker contracts. Browser tests include all five admin controls and installed-worker execution with every page closed, but that execution test mocks relevance and OS display. `EMERGENCY_E2E_NATIVE_NOTIFICATION=true` is an explicit opt-in native-display gate; an ungranted permission must fail rather than be claimed as delivery. No signed UAT or physical Android/provider acceptance is asserted.

Fresh publication qualification passes frontend types, full lint and 74 contracts; the matching backend passes build/native ESM and 853 ordinary tests with 99 opt-in integration skips. These are local checks, not hosted CI or live acceptance.

Production hosted WebSocket ingress remains unverified; production transport remains SSE by default. The initial development publication's dependency-audit failures are retained, not represented as green. SMS is not implemented.

## Explicit release approval (17 October 2026)

The first hosted frontend release run completes with 646 direct passes, four explicit skips, one existing landing-animation retry, and three separate Socket.IO passes. Preserve that qualification and the subsequent unchanged focused result (two passes/one initial paused-style failure). Before promotion, the test's one-shot initial SVG style read is changed to the same bounded polling pattern already used for its running-state assertion. The required paused/running values, reduced-motion/shimmer assertions, app source, global timeout and retry settings are unchanged. This is a test synchronization correction, not an application animation/push change; fresh focused and exact-source CI results are required before release.

The owner subsequently approves the reviewed temporary build-only GHSA-vfj7-8cjw-p6xm exception until **19 October 2026, 23:59 Asia/Manila** (`2026-10-19T15:59:00Z`) and requests live Web Push deployment with development preserved. It is not an upstream fix or a general exception. Runtime findings, unrelated build advisories, audit failure and the exact expiry remain blocking; seven policy contracts run in CI before the real audit. All other tests/build/hosted release checks remain required.

Release keeps the existing first-party gateway, production VAPID keys/worker, cookies and SSE transport. The local push-only dev flag must not be enabled on production builds. No schema/private report mutation, provider key rotation or SMS integration is included. Physical Android/Chrome Main/assigned-department closed-tab delivery and sound remain a separate device test; the owner must sign in, explicitly Allow notifications and close the tab without logging out.
