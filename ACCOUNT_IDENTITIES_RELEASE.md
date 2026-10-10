# Optional Google identities — paired frontend candidate

Baseline frontend: `d1ee16613c64288921e57e80ac25fe4cc577090d`.
Paired backend baseline: `29b101e9170eeadfefd2652cd36decaae2220298`.
Branch: `implementation/auth-identities-20261010`.

`/settings` exposes current-account login methods and optional password-confirmed Google connection/disconnection. It fetches fresh account/method data, matches owners, cancels stale account/logout/page lifecycle results, accepts only the exact Google authorization origin/path and never trusts success query text as connection proof. Passwords and credentials are not stored in browser storage. New protected endpoints use existing coalesced session renewal. Citizen/admin headers link to Settings and retain scope-correct dashboard returns; bounded admin navigation reveals keyboard-focused partially clipped controls without moving the alert monitor or vertical page position.

The paired backend retains established Google subjects and one normalized email per User. Safe automatic linking is limited to ACTIVE locally verified citizens plus strict matching Google-authoritative email verification. Unverified local password citizens and operational accounts use explicit password step-up. Mandatory citizen verification remains retired; no incident/evidence/RBAC prerequisite changes.

Fresh static export and scoped types/lint checks pass. Final 72 synthetic Chromium checks pass: 31 admin-header, 21 Settings, ten OAuth-message and ten additional session-renewal checks. Earlier broader attempts and failures are documented in the canonical workspace record, not represented as a complete full-suite pass. Exact-source hosted full frontend CI is required before rollout; screenshots/mocks do not certify Google exchange or actual Safari/PWA persistence.

This frontend must not be published before compatible backend schema/identities/session behavior passes all release gates. Required gates include authenticated encrypted exact-target backups before migrations, native/staging migration and concurrency validation, coordinated legacy-auth-writer quiescence and identity-drift check, paired staging acceptance, actual Google/PKCE/link/unlink/relogin and device/admin session checks. Production remains unchanged at preparation time.

Legacy backend rollback is unsafe after identity mutations because archived OAuthAccount records do not reflect new links/unlinks. Use a forward-compatible recovery or separately reviewed reconciliation. Provider secrets, private records, incident/evidence data and platform protection settings are outside these source changes.

Canonical engineering reference and detailed local validation: workspace `MASTER_PROMPT.md` Section 60 and `ACCOUNT_IDENTITIES_2026-10-10.md`.
