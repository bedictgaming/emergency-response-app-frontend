# Exact-source release regression follow-up — 26 October 2026

This follow-up is not a live-deployment receipt. The accepted live pair remains untouched while qualification continues. Preserve the initial frontend SHA a2d9f262a076c1d42946ef96150157ec1e5209ed and its cancelled hosted run40283209803:905 scheduled,778 passed,48 failed,79 skipped. Backend a575de5762c750c9d4ae2a55d5435661ee357db7 passes both complete hosted jobs, including native PostgreSQL contracts.

## Application change

Five dashboard report-tab handlers now return immediately when the selected tab is clicked on page1. Previously the handlers cleared the cards without changing the effect dependencies, so no replacement read occurred. Main and FIRE/MEDICAL/POLICE/DRRMO each have desktop/mobile regression coverage. Genuine tab switches and returning from later pages still invalidate/reload. No style, route, schema, authentication, evidence, flagging, consensus, sanction, privacy, distance-calculation or transport implementation changed in this follow-up.

## Test contracts, not production bypasses

- Keep the strict review-view parser. Fixtures echo the selected pending/reviewed view and return matching statuses. Completed history retains a corrected DISMISSED assessment, explanation and unchanged response status.
- Scope incident-collection counts to the collection endpoint, independently of review-queue reads. Preserve outage, queued-read, retry, logout and proactive-renewal assertions.
- Use structurally complete own-account creation receipts. A stale attempt cannot clear another session, publish its receipt or close another session's draft; it does not gain ownership merely because the server committed.
- Match the existing distance label `from Report A` exactly; no distance or GPS tolerance is weakened.
- A partial foreign assessment does not end honest response work. A failed list read removes stale actions; retry recovers the retained assessment and authorized Resolve action without a write.
- Synthetic live notification/history fixtures support SSE and Socket.IO with explicit expected-protocol assertions. No SSE fallback can qualify an explicit WebSocket test. Keep deadlines, privacy/read-receipt/session/reconnect/action checks.

## Evidence and gates

Retain the first fresh local SSE142pass/17fail baseline, then91pass/2fail confirmation. The final four correction-history and ten selected-tab cases pass14/14 on a fresh isolated export with zero retries, completing confirmation of those remaining failures. The other targeted notification, history, monthly and workflow cases passed in the first targeted run. Full TypeScript noEmit and full ESLint pass. One joint Main-desktop/Fire-mobile inspection preserves the incumbent UI; one scoped detector on all five changed pages returns `[]`. These are scoped synthetic/local checks, not a claim of a complete hosted green run or real third-party delivery.

An additional fresh explicit-WebSocket local run is in progress at publication; it is not pre-certified here. The next exact-SHA hosted run must qualify every required job without reported flakiness. Frontend CI now has seven jobs: local contracts, both complete ordinary-suite shards, explicit WebSocket, explicit SSE-canary, nearby, and presence-review. The latter adds private notification/history/monthly update coverage on Socket.IO while preserving presence tests. Keep25-minute job limits, existing retries/assertion deadlines, all suites and unique failure artifacts. Backend still requires both original jobs. Parallel jobs replace a sequential job timeout, never test coverage.

Do not cut over until exact-source CI, clean immutable archives, current platform/configuration/topology checks, a fresh authenticated encrypted backup, approved writer maintenance/additive migration checks, paired candidate and canonical acceptance pass. No production test reports, owner GPS opt-in, evidence/provider sends, account/password resets, paid changes, secret replacement or retention-policy expansion is authorized by this follow-up. Credential rotation and physical-device/provider acceptance remain separately unverified.
