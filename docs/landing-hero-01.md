# Landing Hero 01 adaptation

Scope: local refinement of the existing `/` hero only. No deployment, new brand, authentication/API change, provider configuration, or operational test.

## Direction contract

THESIS: Citizens should recognize emergency reporting and its two safe entry points immediately. Adapt the requested Shadcn Space Hero 01 centered composition, not its agency marketing claims.

OWN-WORLD: Preserve Cordova's logo, existing Inter/system-sans stack, red actions, white/near-black surfaces, restrained borders and rounded controls. Keep the existing page-wide light/dark switch. Design variance 3, motion 2, density 5.

STORY: Read the unchanged reporting promise, choose Report an emergency or Call 911, then understand location, current evidence, and service selection. Preparation content remains informational, never a fake live incident.

FIRST VIEWPORT: Center the wide two-line desktop headline above the existing short description and two visible actions. Reflow the existing preparation panel into an open explanatory strip below. On phones stack text and actions without horizontal overflow.

FORM: User-pinned Hero 01, scoped existing-surface extension; no concept-seed is applicable. Existing navigation, section anchors, reporting/login destinations, legal copy, public-alert states and staging warnings remain untouched.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

No new visual world or durable token change is approved, so preserve the incumbent system instead of creating or replacing DESIGN.md. No shipping raster is added. The referenced template's sample avatars, star ratings, client logos, remote font and animation library are deliberately not imported.

Reference inspected: https://shadcnspace.com/r/hero-01.json (hero and composition source), https://github.com/shadcnspace/shadcnspace/blob/main/LICENSE. This is a manual project-compatible adaptation, not a claim that the installer ran. Attribution is in THIRD_PARTY_NOTICES.md.

## Local validation

The final updated hero builds and exports all 16 routes successfully using installed Next 16.3.8. The primary OneDrive checkout held a `.next/static` file open on the second build (EPERM); final source was verified instead against the unchanged published frontend base in the existing clean local checkout outside OneDrive. Only this hero, its regression test and attribution/documentation were mirrored there. No deployment was performed.

Scoped ESLint, TypeScript and diff-whitespace checks pass. All 25 selected Playwright checks pass, covering the new hero (seven widths from 320 to 1440 in both themes), hydration, existing theme behavior, existing finite preparation motion and report-dialog reduced motion. Reporting and Call 911 controls remain at least 44px tall and within the first viewport. The primary action reaches the unchanged login UI with optional Google and Forgot password, and no resend control. JavaScript-disabled hero visibility and reduced-motion arrow behavior pass. API traffic in the new tests is synthetic; no emergency, account, mail, or provider behavior is certified.

One mechanical Impeccable detector run returned no findings. Final six desktop/mobile/user-width light/dark captures were inspected in the bounded confirmation round. Scoped axe WCAG A/AA checks find zero hero violations in both themes. Local Lighthouse 13.5.0 reports accessibility 100, SEO 100, best practices 96 and performance 62 (LCP 5.5s, CLS 0.09, TBT 610ms). This throttled local whole-page performance run does not meet the aspirational performance floor and is not production field evidence. The localhost export has no backend API, and its console/HTTP results must not be mistaken for a hosted regression. The hero adds no new runtime dependency, external media, font or fetch. Whole-page performance profiling is separate work, not silently addressed in this scoped adaptation.

## Independent finish review

Disposition: ship, scoped to LandingHero.tsx and its visible integration only. The reviewer opened all six final full-page captures at original resolution, compared the production baseline and inspected the hero diff, incumbent header, theme and motion rules. All five direction promises are kept; no material fixes remain. The centered headline/action composition, real `/login` and `tel:911` actions, unchanged content and neutral theme integration match the approved adaptation. Mobile header-brand truncation is pre-existing and outside scope. The disclosed whole-page Lighthouse performance result remains a separate follow-up, not silently certified or optimized.

## Documentation reconciliation

Reconciled with no durable design-system change. The independent documenter compared the hero/diff, current globals, header/logo, new test, attribution, surface contract and root PRODUCT.md/DESIGN.md/MASTER_PROMPT.md. Existing palette, Inter/system-sans typography, container/gutters, moderate control radii, focus, real destinations, and CSS motion remain authoritative. The headline scale and centered composition are surface-specific; no DESIGN.md or sidecar generation is required for this narrow extension.

Frontend-root PRODUCT.md, DESIGN.md and design.json are absent, but workspace-root PRODUCT.md and DESIGN.md exist. Their obsolete daily-quota statement and pre-existing documentation format/token/sidecar drift are reported, not repaired in this task; current executable source and MASTER_PROMPT override them. No shared system file was rewritten. The design-taste-frontend and impeccable skills informed preservation, mobile/theme/accessibility checks and the independent finish/documentation reviews.

Final status: implemented and reviewed locally, not committed, pushed or deployed. Final hero source in the clean verification checkout matches the primary workspace after newline normalization. Local preview uses an isolated localhost API origin, never production, and may show the honest advisory-unavailable state without a local backend.
