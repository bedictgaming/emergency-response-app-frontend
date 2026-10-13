# Cordova Emergency Response — SEO guide

Updated: 13 October 2026, Asia/Manila. Status: implemented locally; deployment and live search-engine acceptance are separate steps. Production currently remains the refactor release recorded in workspace `OPERATIONS.md` and `MASTER_PROMPT.md`.

## What this does

Help people find the public Cordova, Cebu emergency-reporting homepage and give shared links an understandable title, description and image. It does not promise ranking, immediate indexing, emergency response time, GPS attestation or government endorsement. Existing reporting, account, session and permission rules are unchanged.

| Surface | Search policy |
| --- | --- |
| `https://cordova-emergency-response.site/` | Index/follow only in an explicitly approved public production build; the only sitemap entry |
| `/login`, including sign-up and password recovery | Noindex/nofollow; no account information, reset tokens or public structured data |
| `/dashboard`, `/settings`, every `/admin/*` page | Noindex/nofollow/nosnippet/noimageindex; generic page titles, never citizen or incident details |
| 404 and offline fallback | Noindex; excluded from sitemap |
| Local, staging, preview, validation or incomplete build configuration | Homepage also noindex; empty sitemap and no `WebSite` JSON-LD |
| Production-built generated Vercel URLs | Public config supplies a host-conditional `X-Robots-Tag: noindex, nofollow, nosnippet` outside `.site`; verify this on Vercel before release |

HTML routes remain crawlable so supporting crawlers can read `noindex`. API prefix casing is excluded in `robots.txt` to discourage API crawling. `robots.txt` is not a privacy boundary: login, active-account checks, RBAC, evidence ownership and API no-store remain authoritative. Do not disallow protected HTML shells merely to hide them; Google cannot read their noindex tags when crawling is blocked. [Google: noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [robots.txt limits](https://developers.google.com/search/docs/crawling-indexing/robots/intro).

## Files to maintain

- `src/lib/seo-policy.mjs`: canonical origin from `public-origins.mjs`, name, homepage title/description, public-build gate, homepage-only sitemap and public website schema.
- `src/lib/seo.ts`: typed Next metadata and fail-closed private-page metadata.
- `src/app/layout.tsx`: branded title template, metadata base, private default and existing PWA settings.
- `src/app/page.tsx`: server-rendered homepage metadata and safely serialized public JSON-LD. The original interactive landing/session/reset behavior stays in `src/components/landing/LandingPage.tsx`.
- Route-group layouts: private login, citizen, account and admin metadata. Keep `AdminAccessBoundary` unchanged.
- `src/app/robots.ts`, `src/app/sitemap.ts`: explicitly static export-compatible metadata endpoints. No database calls or live incident enumeration.
- `public/images/seo-share-card.png`: 1200×630 public PNG, generated with `scripts/generate-seo-card.mjs` from the existing first-party logo and public copy. No real report, contact, dashboard screenshot, external imagery or provider/font download is used.
- `vercel.json`, `vercel.public.json`, `vercel.production-validation.json`: matching existing security headers plus noindex headers for noncanonical hosts and any URL containing `resetToken`. Header matching needs independent live Vercel verification; the local static server does not emulate it.
- `scripts/seo.test.mjs`, `scripts/check-seo-export.mjs`, `e2e/seo.spec.ts`: policy, exported artifact and browser regression checks.

Use factual descriptions of reporting and location assistance. Do not add fake ratings, a fake search box, agency addresses, staff contacts or claims of guaranteed GPS accuracy. The only JSON-LD type is `WebSite`, representing the actual public site name and URL; there is no claim of eligibility for software-app review stars. [Google site names](https://developers.google.com/search/docs/appearance/site-names), [structured-data quality](https://developers.google.com/search/docs/appearance/structured-data/sd-policies).

## Build configuration

SEO reuses existing mode variables; no new secret or backend variable is required. The public index opt-in requires all of:

```env
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://cordova-emergency-response.site
NEXT_PUBLIC_PUBLIC_LAUNCH=true
NEXT_PUBLIC_PRODUCTION_VALIDATION=false
NEXT_PUBLIC_PREVIEW_ONLY=false
NEXT_PUBLIC_STAGING_TEST=false
```

Either `VERCEL_ENV=preview` or `NEXT_PUBLIC_VERCEL_ENV=preview` disables the opt-in. A local API URL, legacy alias, missing flags or test mode also disables it. These values are frozen by static export: rebuild after changes. Do not enable public mode just to remove a preview banner or improve an SEO score. Preserve preview protection; noindex is advisory and cannot protect private data. Other deployment targets/domains need separate policy and hosting review, not silent canonical changes.

## Verify before deployment

Run from the frontend directory with its installed dependencies:

```powershell
npm run test:seo
npm run test:architecture
npm run lint
npx tsc --noEmit
```

For a freshly built export, inspect the correct output directory and the intended mode explicitly:

```powershell
node scripts/check-seo-export.mjs out public
# For a local/preview/test export instead:
node scripts/check-seo-export.mjs out private
```

The checker reads files only; it verifies one canonical homepage, correct social metadata, schema gating, homepage-only/empty sitemap, protected-route noindex and PNG dimensions. Use the real output directory when `EMERGENCY_E2E_DIST_DIR` changes it. Never pass an old export as evidence for a changed source. Run `e2e/seo.spec.ts` and the existing landing, session-restore, password-recovery and admin-boundary suites against a fresh isolated local export with synthetic API fixtures, not real emergency submissions.

To update the card, edit its public text/layout source, run `npm run seo:card`, inspect the PNG, and include the generated file in the source change. It is a committed public asset; there is no runtime image-generation service. If the asset URL changes, update `SEO_IMAGE` and the browser expectations together. Do not change the emergency logo or use private screenshots.

## After an authorized production deployment

1. Check `.site/` returns 200, a single correct title/description/canonical, index/follow and one factual `WebSite` JSON-LD script in the exported HTML.
2. Check `/robots.txt` and `/sitemap.xml` return the expected content types and list only the canonical homepage. Keep private URLs, query strings and invented `lastmod` dates out of the sitemap. [Google sitemap guide](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).
3. Check login, citizen, settings and admin HTML remain noindex; test unauthenticated private APIs are still denied. Verify existing CSP/no-store and accepted old-domain 307 redirects.
4. Check an unpromoted/generated production Vercel URL returns `X-Robots-Tag: noindex`; check the canonical homepage without a reset query does not get that header. With a **synthetic**, nonredeemable reset query, verify noindex without opening a real reset link or sharing its token. These are non-mutating checks; never submit a real incident for SEO testing.
5. Check `/images/seo-share-card.png` returns 200 with `image/png`, and review only the public homepage in social preview tools. Caches may need refreshing; actual platform preview display is not certified by local metadata tests.

## Local verification record

Both clean and primary TypeScript/scoped lint checks pass; the clean checkout's full lint also passes. All 47 SEO/architecture/deployment/gateway/worker contracts and 63 targeted Chromium cases pass with no retries, using synthetic APIs. Fresh public and private builds export 18 framework routes each; artifact checks verify the homepage mode, all fourteen protected/error paths, all seventeen exported HTML files, sitemap/schema gating and image dimensions. Primary and clean SEO source/guide bytes match after newline normalization, and the public card SHA-256 is `f4daa3688bfc77455f5ea50e683babb931a278fd03ca74e868eab1480ced9987`.

The changed headers in all three Vercel templates validate against the current official `headers` schema definition. This is not full platform configuration validation or live header acceptance. Earlier full-schema attempts cannot complete with the available Draft-04 support/Python modules and remain non-accepting. The first artifact checker rejects Next's equivalent slash-normalized homepage URL; it is corrected to compare exact parsed URL semantics. Two intermediate contract runs catch missing parity across the three templates; identical headers are added without weakening their assertions. The one Impeccable mechanical check has no findings, and the generated card is visually inspected. Preserve these distinctions; the fresh full hosted suite and the post-deployment checks above remain release work, not certified here.

## Google Search Console — owner steps

After deployment, the domain owner can add the `cordova-emergency-response.site` property in [Google Search Console](https://search.google.com/search-console), follow its ownership verification instructions, and submit `https://cordova-emergency-response.site/sitemap.xml`. For DNS verification, add only the requested TXT record in Hostinger; do not replace nameservers or delete the existing website A/CNAME records. Do not paste account secrets or reset links into tools.

Inspect the canonical homepage using URL Inspection and request indexing if offered. Review Page Indexing and search performance over time; private routes are intentionally excluded, not an SEO defect. Google chooses its displayed title/snippet and may rewrite them, so a different search-result description is not proof that deployment failed. No exact appearance date or ranking is guaranteed. [Title guidance](https://developers.google.com/search/docs/appearance/title-link), [description guidance](https://developers.google.com/search/docs/appearance/snippet).

This implementation does not create a Search Console property, change DNS, submit URLs, deploy source, install analytics or certify live Google/social-platform behavior. Those remain separately authorized owner/release actions.
