# Frontend architecture

Structure reference: [Chimairel/Kainara](https://github.com/Chimairel/Kainara/tree/d17b30482398472a02eefd505950f8b42af6b223/frontend/src). This adapts organization, not implementation or authentication behavior.

```text
src/
  app/
    layout.tsx, globals.css, page.tsx, not-found.tsx
    (auth)/login/
    (citizen)/dashboard/
    (admin)/admin/                  # shared access-boundary layout retained
    (account)/settings/             # settings is shared by supported roles
  components/
    auth/                          # login, recovery, settings, session guards
    citizen/                       # reporting, camera, own report history
    admin/                         # monitoring, review, report tasks, staff history
    landing/                       # public presentation only
    shared/                        # header, logo, PWA, network, evidence viewer
    ui/                            # unified primitive/loading/motion location
  hooks/                           # GPS, events, modal isolation, staff guards
  lib/
    apiClient.ts                   # single credentialed API transport
    services/                      # typed resource requests
    public-origins.mjs              # also consumed by Node release scripts
  types/                           # shared DTOs, never runtime authority
public/                            # static assets and privacy-preserving worker
gateway/                           # server-only Vercel routing/signing boundary
scripts/, e2e/                     # tooling and synthetic verification
```

`@/*` resolves to `src/*`. Route groups organize ownership without changing URLs. Retain one root layout, static export, the shared admin boundary and cookie renewal. Components, hooks and client utilities must not import route implementations, platform gateway or server email integrations.

Backend authorization remains authoritative. Cached profiles and client guards are navigation safeguards. Do not introduce readable credential tokens, alternate raw Axios clients, cached private evidence, automatic mutation retries or new polling loops as a refactor.

`components.json` points at `src/app/globals.css`; existing primitive families share `src/components/ui`. Assets, platform functions, gateway and configuration keep their framework-required root paths.

Run lint, TypeScript, `npm run test:architecture`, existing deployment/gateway/worker contracts, a fresh static build and Playwright. Rebuild generated route types after relocation rather than suppressing diagnostics. Mocked browsers do not certify Google/Brevo/GPS/camera or physical phones.

Root `MASTER_PROMPT.md` is canonical. Historical release documents retain original paths and receipts; this guide describes local source, not deployment.

Unit retirement (14 October, local): Fire no longer mounts dispatch UI; the unit modal/component/request client are archived recoverably and removed. Operations remains at its existing guarded URL as Incident tasks, without unit/equipment fetches or controls. Current user/history tables no longer present unit tracking. Department headings/actions name reports/response status, not physical dispatch. Historical incident-unit DTOs are type-only compatibility data. Staff arrange vehicles/crews outside the app. Main review, departmental Resolve, evidence, GPS, session and report-history boundaries are unchanged; see root UNIT_RETIREMENT_2026-10-14.md for verification and deployment status.
