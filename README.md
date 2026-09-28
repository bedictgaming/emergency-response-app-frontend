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
`vercel.staging.json` is an explicit, protected test-deployment configuration: its CSP allows only the Railway staging API, Cloudinary, and Nominatim. Build it with `NEXT_PUBLIC_API_URL` set to the staging HTTPS origin, `NEXT_PUBLIC_STAGING_TEST=true`, and `NEXT_PUBLIC_PREVIEW_ONLY=true`. The banner then states that test reports are not emergency requests. The current protected Vercel alias was deployed with this temporary build override; a plain redeploy uses the saved `.invalid` API setting again. Do not remove protection or connect the Git production branch until the hosted production API, real cookies and integrations, CSP, live workflow, and release gates are validated.
Both Vercel configurations select its static-host preset for the Next static export, build into `out/`, and serve clean URLs. The Vercel Next.js server adapter expects a `.next` routes manifest and is not used for this export. Verify the deployed CSP and API origin after every deployment.

`npm run test:e2e` builds the static export and tests it on an isolated local server at port 3100. The browser workflow tests mock API/Cloudinary responses; they do not create emergency reports, upload real photos, or send notifications. They are not a substitute for staging integration and physical-device tests.

Failed submissions retain their fields and proof photo while the form remains open. Drafts are not persisted across reloads. Offline submissions are not marked as accepted.
