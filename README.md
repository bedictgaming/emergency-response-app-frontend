# Emergency Response Client

Next.js progressive web app for Cordova's emergency-response workflow.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_API_URL` to the API URL reachable by browsers.
3. Run `npm ci` and `npm run dev`.

## Build and PWA preview

```text
npm run lint
npm run build
npm run preview:pwa
```

The client includes a service worker for static-shell resilience. Emergency submissions intentionally require connectivity because the server must verify proof photos and prevent duplicates before accepting a report.

## Release gates and browser tests

`npm run release:check` rejects local or placeholder API endpoints before a PWA deployment. It does not publish the app.

The Vercel project remains protected by Vercel Authentication on **all** deployment URLs. The default `vercel.json` and saved project environment point to a reserved `.invalid` API origin and show a non-operational preview warning. Vercel CLI linkage lives in ignored `.vercel/`; never commit `.env.local`.
`vercel.staging.json` is an explicit, protected test-deployment configuration: its CSP allows only the Railway staging API, Cloudinary, and Nominatim. Build it with `NEXT_PUBLIC_API_URL` set to the staging HTTPS origin, `NEXT_PUBLIC_STAGING_TEST=true`, and `NEXT_PUBLIC_PREVIEW_ONLY=true`. The banner then states that test reports are not emergency requests.
`vercel.production-validation.json` is for a protected validation build against the live Railway API. It forwards both trailing-slash and slashless `/api/:path*` requests to `https://api-production-49dea.up.railway.app/api/:path*` without caching API responses. Both rewrite forms are necessary: the initial proxy sent list URLs ending in `/` to Vercel's own 404 instead of Railway. Build it with `NEXT_PUBLIC_API_URL=https://cordova-emergency-response.vercel.app`, `NEXT_PUBLIC_PRODUCTION_VALIDATION=true`, and `NEXT_PUBLIC_PREVIEW_ONLY=true`. The `prebuild` lifecycle enforces these values even if Vercel project settings override the local config's build command. For OAuth and protected evidence to use first-party cookies, the backend `BACKEND_URL` is the exact Cordova alias and that alias's `/api/auth/v1/google/callback` is registered on the Google OAuth client. On 29 September 2026, these coordinated settings were applied to the protected Cordova alias. A user-observed Google sign-in reached the citizen dashboard; read-only proxy checks confirmed unauthenticated incident requests return Railway's `401`, alerts return `200`, and both API path forms route correctly. An authenticated report-list read, evidence workflow, and incident delivery still require browser validation. Vercel Authentication redirects the manifest to a cross-origin SSO URL that cannot be loaded under its CORS policy, so this protected validation build omits the manifest link, unregisters any old service worker, and hides installation controls. Ordinary builds still include the same PWA manifest and service worker. The banner warns that test submissions affect the live system. The Cordova Vercel alias remains behind Vercel Authentication. A unique preview URL cannot complete credentialed API workflows because the backend admits only the exact Cordova frontend origin and the OAuth callback is bound to that alias. Keep Vercel Authentication on and coordinate any real-data test before submitting; never use this build as the public release. A public production build requires a separate approved configuration and completed release gates.
On 29 September, one coordinated Fire-only submission returned production HTTP `201` and appeared on Fire but not Medical. Fire's evidence link failed after the thumbnail's 60-second signed storage URL expired. Evidence-open links now use the protected `/content` endpoint, which authorizes and issues a fresh URL on every click. The corrected protected deployment passed a live Fire-admin retest after expiry.
`vercel.public.json` is the separate public-build configuration with the same exact first-party API rewrites and no-store API headers. Build it only with `NEXT_PUBLIC_API_URL=https://cordova-emergency-response.vercel.app`, `NEXT_PUBLIC_PUBLIC_LAUNCH=true`, and the preview, validation, and staging flags set to `false`. Both the release check and prebuild reject a direct API origin or conflicting flags. A local public export passed those gates and includes the PWA manifest without the validation banner; this is not proof that the deployed public flow works. While this public-build candidate is still behind Vercel Authentication, manifest requests redirect to Vercel SSO and produce CSP/CORS warnings; do not loosen `manifest-src` to permit the SSO response. Once public access is deliberately enabled, verify the manifest loads from the same origin with HTTP 200. Keep deployment protection enabled until physical-device acceptance, evidence and session checks, monitoring, and rollback are ready.
On 30 September, a physical-phone check of the protected production candidate passed citizen login, GPS, map pin, camera preview, report list, and viewing the current test photo. A separate read-only audit found 14 older attachment records whose stored authenticated Cloudinary IDs no longer retrieve originals. A bounded comparison found candidate public-upload assets for four records based on byte size, dimensions, format, and perceptual hash; ten remain unmatched, and no record has been relinked. The missing image bytes cannot be reconstructed from the database. The evidence component replaces a failed image and its view link with an explicit unavailable state and retry action. Two targeted browser tests cover authorized photo access and missing-image recovery. The Vercel project remained on **All Deployments** protection; selecting a public setting was not saved. See the root `OPERATIONS.md` for recovery and rollback guidance.
Both Vercel configurations select its static-host preset for the Next static export, build into `out/`, and serve clean URLs. The Vercel Next.js server adapter expects a `.next` routes manifest and is not used for this export. Verify the deployed CSP and API origin after every deployment.

`npm run test:e2e` builds the static export and tests it on an isolated local server at port 3100. The browser workflow tests mock API/Cloudinary responses; they do not create emergency reports, upload real photos, or send notifications. They are not a substitute for staging integration and physical-device tests.

Failed submissions retain their fields and proof photo while the form remains open. Drafts are not persisted across reloads. Offline submissions are not marked as accepted.
