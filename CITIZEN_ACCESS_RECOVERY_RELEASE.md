# Citizen access and recovery — October 7, 2026

Citizen signup invites immediate credential login without asserting verified email ownership. Log In, Sign In/Create Account and optional Google remain. Forgot password and an accessible request/reset panel are restored; resend verification remains absent. Exactly one 64-hex reset token is accepted without OAuth/verification mixing; opening a link never redeems it. Confirmation is explicit, has no automatic retries, aborts on changed links/unmount and removes the capability from the URL after success. Existing Google identity binding, admin privileges and report verification are unchanged.

Canonical workspace reference: MASTER_PROMPT.md Section 37. This clean candidate excludes unfinished VPS and separate email-relay work. The reviewed Brevo/staging-feedback base retains the sharp security patch and fixed staging-gateway identity. Production and preview build modes remain distinct; protection must not be changed.

Production publication is held pending valid Brevo staging authentication, controlled real reset-email receipt/redemption/session acceptance and exact-candidate CI. Local export or mocked browser checks are not live delivery certification.

The operator's replacement staging key now passes read-only provider authentication; transactional sending and the intended sender are active. Clean lint and fresh isolated export pass. Browser/CI and live recovery acceptance results must be recorded separately; production remains unchanged.
