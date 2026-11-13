# Under-13 privacy review — Study Forge V2

Date: 2026-11-13
Scope: proposed school-level onboarding in PR #1, its age selection, guest storage, account, cloud integrations, and public-facing notices.

## Decision: NOT APPROVED for under-13 launch

This is a technical/privacy gap assessment, not a legal opinion or COPPA compliance certification. School-level support for older users can be reviewed separately, but the under-13 experience must not be promoted as COPPA-compliant until the issues below are resolved and externally reviewed.

### Work examined

- `src/App.tsx`, `src/main.tsx`, `src/data/schoolProfile.ts`, `src/components/CourseSetup.tsx`, `src/components/AccountMenu.tsx`, `src/features/AuthPages.tsx`
- `src/data/cloudImport.ts`, `src/components/AddFiles.tsx`, `src/data/driveFiles.ts`, `src/data/googleCalendar.ts`, `src/features/CalendarPage.tsx`, `src/features/GoogleCalendarPage.tsx`
- Firebase backend and sync initialization, privacy and terms pages, and public HTML entrypoint.

### Confirmed corrections in this branch

1. Account sign-in routes are disabled after the local under-13 preference is set; account-backend preloading now checks that preference.
2. Cloud-file imports are no longer offered in under-13 mode; direct cloud preparation and picker entrypoints reject it.
3. Google Calendar and Drive-backup authorization entrypoints reject under-13 local-only mode; automatic calendar preparation checks mode, and the calendar integration route is blocked.
4. Firebase sync initialization and backend loading now check child mode.
5. The privacy notice distinguishes browser-stored study data from network requests to the hosting provider and third-party infrastructure. The agreement version is updated so prior consent is not silently reused.

These are defense-in-depth client-side safeguards. Their existence does not establish COPPA compliance.

### Remaining release blockers

- **Pre-selection network requests:** Before a visitor selects an age, the app and hosting infrastructure can exchange network data, and optional third-party scripts may load on some screens. The children's flow needs entry-point design and an actual request-by-request network audit before any third-party contacts.
- **Parental notice and consent:** No completed verifiable parental-consent process, approved exception analysis, or parent dashboard / access and deletion mechanism has been established.
- **Age determination:** Self-reported age is a browser preference, not independently verified age; existing signed-in accounts, cross-tab changes, guest/account transitions and direct navigation need a complete threat-model and test matrix.
- **Data inventory and providers:** Audit and document hosting logs, service-worker requests, Google APIs, Firebase, speech-model downloads, CDNs, optional imports, browser notifications and any further dependencies. Confirm contracts, data handling, and whether persistent identifiers or other personal information are processed.
- **Retention, security, parent rights:** Document any server-side retention and deletion of children's data, access controls, data-minimization measures, parent rights, and actual provider behavior.
- **Product and policy:** Children's suitability, audience classification, consent requirements and the privacy notices require qualified legal/privacy review against the 2025 FTC COPPA amendments (general compliance deadline April 22, 2026).

### Recommended launch sequence

1. Keep PR #1 unmerged and under-13 mode unadvertised until technical and legal blockers are closed.
2. Test a fresh under-13 visitor in a clean browser with network logging **before and after** age selection, including direct URLs, file import, calendar, backups, account recovery and separate tabs.
3. Decide whether to implement verifiable parental consent or exclude under-13 access until a legally reviewed local-only design is ready.
4. Have a qualified privacy professional confirm applicable obligations, child-directed/mixed-audience classification, required notices/consent and data retention.
5. After privacy and UX verification, run all CI tests, review the PR and merge deliberately to `main`. Confirm a successful main-branch GitHub Pages deployment before announcing launch.

### Sources

- FTC COPPA FAQ: https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- Amended Rule: https://www.govinfo.gov/content/pkg/FR-2025-04-22/html/2025-05904.htm
