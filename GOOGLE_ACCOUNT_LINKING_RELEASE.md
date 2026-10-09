# Citizen Google connection release — October 9, 2026

Dashboard adds a collapsed Account sign-in disclosure. Current server status,
not callback hints or browser storage, controls connection state. Passwords are
cleared on submission/collapse/account switch. Google-only users establish a
system-password fallback through existing recovery before unlinking.

Native summary activation clears password and cancels requests synchronously
when closing, even if rapid close/reopen coalesces browser toggle events.
Link/unlink requests use existing session renewal and are not automatically
replayed. Late account/session responses are discarded. Unlink signs out and
clears cached identity. Header, incident, emergency, recovery and staff flows
are unchanged. New action buttons preserve >=4.5:1 theme contrast, 16px phone
input text and 44px touch targets.

Local feature checks use synthetic APIs. Exact-source hosted CI, first-party
staging cookie/Google consent acceptance and actual production checks remain
release gates. No provider credentials belong in frontend code or builds.
