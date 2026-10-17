# Development candidate: Socket.IO, reference cache and admin Web Push

This source update is for `development`, paired with the matching backend candidate. A source push is not a live deployment or approval to renew audit exceptions/change production configuration. The workspace's `MASTER_PROMPT.md` remains the canonical engineering reference.

## Transport and cache

`src/lib/emergencyTransport.ts` selects Socket.IO in ordinary Next development; production keeps SSE by default. `NEXT_PUBLIC_EMERGENCY_TRANSPORT=socket.io|sse` explicitly selects a transport at build time. Socket.IO uses WebSocket-only `/api/events/v1/socket.io`; there is no hidden polling fallback. Existing account-isolated shared streams, reconnect/backoff, lifecycle catch-up reads and permission/session boundaries are retained.

The backend must support the selected transport and preserve its authenticated gateway upgrade boundary. Never bypass the gateway or place tokens in query strings. Events invalidate fresh authorized HTTP reads; no zero-latency, exactly-once or multi-replica replay guarantee is made.

Only the public barangay reference list is cached for 60 seconds in document memory. Reads are coalesced/cloned, errors are not cached as empty success, and `getBarangays({fresh:true})` invalidates it. Private reports, evidence, credentials, sessions and permissions are not cached. Submission still validates current references on the server.

## Admin notification controls

The shared admin header has Background notifications for Main and all four departments. Permission is requested from an explicit click, never an unsolicited passive prompt. Registration is bound to the current account/logout identity and must persist through the authenticated API before success is shown. Missing configuration, worker disabled, denied permission, failed registration and unavailable service worker remain distinct recoverable states.

Show device test requests a local native notification display only. It is not a server-send, provider acceptance or closed-tab delivery test. Actual OS sound/DND, internet, browser lifetime and phone battery restrictions can suppress/delay notifications. Closing a tab is different from Logout or force-stopping the browser.

## Local development opt-in

- Set `NEXT_PUBLIC_API_URL=http://localhost:8000` and `NEXT_PUBLIC_ENABLE_DEV_PUSH=true` only for a controlled loopback test with the matching backend, separately approved synthetic database and fresh development VAPID keys. Never put a private key in frontend variables or Git.
- The explicit loopback mode registers `/sw.js?pushOnly=1&apiOrigin=...`. It never intercepts/caches development assets/API calls. Authenticated relevance requests allow only the same hostname/protocol on API port 8000, with no credentials/path/query override.
- Normal development without that flag continues unregistering service workers/app shell caches to avoid stale assets. Protected validation continues disabling push. Production always uses its first-party API gateway.
- A Git checkout does not automatically enable the backend worker or replace the owner's primary demo runtime. The owner's isolated local operator/private configuration is intentionally not in this source commit.

Use separate normal browser profiles/devices for simultaneously subscribed Main and department accounts. On each: sign in, Enable notifications, Allow, then close the site tab without logging out. Submit one synthetic Medical report from a separate citizen session and record whether Main and Medical actually receive the hint while other departments do not. Repeat bounded tests for the other services. An Android phone's localhost is not the laptop; plain LAN HTTP does not qualify for phone push. A separately authorized reachable HTTPS environment is needed.

## Test boundaries and release hold

`npm run test:realtime`, `npm run test:push` and `npm run test:worker` exercise transport/cache/registration/worker contracts. Browser tests include all five admin controls and installed-worker execution with every page closed, but that execution test mocks relevance and OS display. `EMERGENCY_E2E_NATIVE_NOTIFICATION=true` is an explicit opt-in native-display gate; an ungranted permission must fail rather than be claimed as delivery. No signed UAT or physical Android/provider acceptance is asserted.

Fresh publication qualification passes frontend types, full lint and 74 contracts; the matching backend passes build/native ESM and 853 ordinary tests with 99 opt-in integration skips. These are local checks, not hosted CI or live acceptance.

Production hosted WebSocket ingress remains unverified; production transport remains SSE by default. The pre-existing build-only braces dependency-audit allowance expired on 17 October 2026. Fresh audit commands in both repositories reach that unchanged expiry check after finding no runtime advisory. It is not renewed or bypassed here; hosted CI may stop on that legitimate release blocker even when feature checks pass. No live deployment, SMS, live credential rotation or production worker activation is included.
