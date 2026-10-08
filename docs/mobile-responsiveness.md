# Mobile responsiveness — October 7, 2026

This is a responsive refinement of the existing Cordova design, guided by Impeccable's Adapt playbook. Authentication, incident verification, duplicate detection, RBAC and API payloads are unchanged.

## Layout and interaction contract

- Landing and account headers retain their existing motion, branding and actions. Call 911 has a 44px minimum hit area even when only its icon is shown.
- Phones keep the red account panel above the active login/signup form; desktop keeps the sliding split panel. Login and signup use equal horizontal gutters to center the shell. Account content now scrolls to the dynamic viewport bottom, with scroll padding for focused controls rather than a fixed opaque 64px bottom strip. The lower-right theme switch floats over the page. The shared header accepts this optional scroll container so it still hides down/returns up without changing other routes' window scrolling.
- Citizen reports and operational records wrap long unbroken text instead of widening the document. Reporter name/contact fields stack on phones and share a row from 640px.
- Below 1024px, or with a coarse pointer, operational/citizen controls and portalled dialogs use a 44px minimum touch area and editable text fields use 16px text. Native checkboxes, file inputs, inline prose links and map-library controls are excluded from this shared sizing rule.
- Admin navigation wraps on narrow phones. Analytics and main-admin Users shortcuts remain available; the existing wider-screen scrollable toolbar is retained. Incident maps remain available on phones. The Users table keeps a 640px minimum width inside a labelled keyboard-focusable horizontal region, preserving readable role badges and access to account actions without widening the page.
- Operations records/actions and responder headers wrap and reflow. Refresh does not shrink into a broken word.
- Report and dispatch dialogs use dynamic viewport height with an internally scrollable body. Dispatch is portalled above the pinned header and animated report cards, using the existing modal-isolation hook for background inertness, focus containment/restoration, Escape and scroll locking. The hook supports both the existing history-root marker and a generic modal-root marker.

## Verification

Latest narrow follow-up removes login's fixed bottom strip without losing horizontal centering. Primary submit buttons below 1024px retain centered side clearance from the floating theme switch. The rebuilt export/all 16 routes, TypeScript, scoped lint/layout scan and all 32 selected account/header/split/hydration checks pass; three changed source/test files match the tested checkout. These supersede the bottom-area geometry in the earlier 183-test receipt below, not a rerun of the entire system suite. Final phone light/dark login/signup confirmation shows no fixed strip and no primary-action corner overlap.

The new `e2e/mobile-responsive.spec.ts` intercepts every API request, rejects mutations and uses only synthetic accounts, records and GPS coordinates. It covers landing, login, citizen dashboard, all five department dashboards, users, analytics, history, operations/editor, responder tasks, report and dispatch dialogs at 320×667, 390×844, 768×1024, 844×390 and 1440×900. Existing suites cover signup/recovery, both public themes, header motion, history touch scrolling and hydration.

Final isolated export builds all 16 routes with TypeScript passing; scoped ESLint and all 183 selected synthetic-API Chromium regressions pass. Twenty-one scoped source/test files match the tested checkout after newline normalization. The batch includes all 75 new responsive checks plus shared public/citizen/admin headers, landing actions, centered login/signup, recovery entry, split-panel keyboard/motion/state, history hardening/touch scrolling, report-scroll stability and theme hydration/navigation.

Initial inspection found citizen-root text overflow, dispatch stacking beneath the pinned header, a cramped Operations Refresh control and squeezed Users role badges; these were corrected. Report contact text also had an important 14px override from 640px, now deferred until desktop (1024px). Dialog geometry checks wait for settled animation but retain the same touch/font thresholds. Eight final phone/desktop light/dark account captures and targeted phone/table/dialog captures were reviewed in bounded batches, with no further cosmetic changes. Account captures deliberately show the initial inner-scroll viewport; lower signup fields/actions remain reachable by scrolling. The red Forgot password outline is the keyboard-focus state.

User localhost:3000 is not restarted or cache-cleared and reflects workspace changes through development reload. The older isolated port 3106 preview is not claimed to reflect this responsive update. The separate temporary loopback staging API is left unchanged; a transient readiness failure recovered to HTTP 200 on read-only health/readiness confirmation, not a live-provider certification.

This is browser-emulated layout verification, not real iPhone/Android/Safari, hardware GPS/camera, live provider, accessibility-conformance or production certification. No email, emergency report, dispatch, notification, database/schema change or deployment is performed. The previously recorded unrelated admin logout/polling test remains outside this UI change; global document drift is reported, not repaired.

Before a public release, check a physical iPhone and Android in portrait/landscape with the keyboard open, installed-PWA safe areas, camera/GPS permissions and real touch scrolling. Use controlled, authorized tests only.
