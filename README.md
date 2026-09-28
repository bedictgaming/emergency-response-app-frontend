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

`npm run test:e2e` builds the static export and tests it on an isolated local server at port 3100. The browser workflow tests mock API/Cloudinary responses; they do not create emergency reports, upload real photos, or send notifications. They are not a substitute for staging integration and physical-device tests.

Failed submissions retain their fields and proof photo while the form remains open. Drafts are not persisted across reloads. Offline submissions are not marked as accepted.
