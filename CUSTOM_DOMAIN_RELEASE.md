# Production custom domain — 11 October 2026

Canonical: https://cordova-emergency-response.site. Keep the existing Vercel Cordova
alias active without a redirect. Live public/validation builds accept only these two
exact API origins. Explicit staging identity/mode gates remain unchanged.

On either approved live alias the browser selects its own origin for API, SSE and
refresh requests; unknown hosts, local builds and isolated staging retain the configured
API origin. Cookies remain host-only. One sign-in on the new host is necessary;
existing sessions on the old host are not revoked. Both domains access the same users.

The gateway signs v2 request-origin metadata along with its existing request proof,
replacing all client-supplied proof headers. Backend compatibility must be deployed
before this frontend is promoted. Google callbacks/destinations are selected only from
authenticated metadata and the exact backend allowlist, with state/S256/RBAC unchanged.
Register the new callback in the existing Google production client and retain the old.

Private evidence authorization converts only approved attachment-content endpoints
to the current API client's relative access-url route. It does not reuse another host's
session or alter private Cloudinary access, account-generation checks or evidence RBAC.

Publish from the exact-source archive after CI passes, verify both production aliases,
and then set canonical backend FRONTEND_URL/BACKEND_URL with old alias in
ADDITIONAL_FRONTEND_ORIGINS. Do not change staging, cookies, gateway secrets, database,
notification/evidence controls, protection settings or DNS/mail records as a workaround.
Builds/mocks are not proof of real provider exchange or physical phone behavior.
