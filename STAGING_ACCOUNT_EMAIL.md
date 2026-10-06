# First-party account-email staging

This preview exists only for controlled account-verification/password-reset acceptance. It is not an emergency site and must never be promoted to production.

`npm run deploy:build` retains deployment/prebuild gates and static export. With `EMERGENCY_STAGING_GATEWAY=true`, it additionally requires Vercel preview identity, this existing project ID, the platform-generated project preview URL, the fixed staging gateway upstream/audience and explicit `NEXT_PUBLIC_STAGING_TEST=true`, `NEXT_PUBLIC_PREVIEW_ONLY=true`, public/production-validation false. It derives the browser API origin from that deployment URL. Production retains its exact Cordova origin and original modes. The signing key is server-only.

Deploy from an isolated clean candidate excluding the unfinished Gmail relay and VPS work. Keep Vercel protection and production settings/domain unchanged. Match Railway staging FRONTEND_URL and BACKEND_URL to the validated preview origin only after its full pages and authenticated gateway respond. Staging workers, evidence deletion/sweep and production namespace remain prohibited. No migration is required.

Before real controlled sends, check reset page rendering, first-party API 401/no-store, unsigned backend 403, CSP and staging warning. Send only explicitly approved, staging-labeled account emails for synthetic accounts delivering to the operator-controlled inbox. Generic acceptance and mocked tests are not inbox receipt. Bound attempts; do not automatically resend ambiguous failures or edit token/cooldown dates. No incident/evidence/responder action belongs in these checks. Record hosted revision/provenance and actual results in the workspace Brevo report.
