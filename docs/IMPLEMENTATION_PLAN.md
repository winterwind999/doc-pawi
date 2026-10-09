# Doc Pawi — Implementation Plan

> **Document role:** actionable work phases with stable task IDs, dependencies, acceptance criteria, and current status.
> Statuses: **Not started · In progress · Blocked · Implemented** (code complete) **· Verified** (tested; the evidence column says where — unit tests in Node or the physical Android device).
> Related: [PRD](PRD.md) · [Testing](TESTING.md) · [Technical Requirements](TECHNICAL_REQUIREMENTS.md)

No calendar estimates are given; tasks are ordered by dependency.

## Phase 1 — Repository and technical verification

| ID | Objective | Depends on | Deliverable | Acceptance criteria | Status | Evidence / blockers |
|---|---|---|---|---|---|---|
| P1-001 | Inspect workspace, branch, remote | — | Findings | Branch `master`; remote empty; user's uncommitted `app.json` EAS lines preserved | Verified | `git status`, `gh repo view` |
| P1-002 | Configure `origin` (HTTPS) | P1-001 | Remote | `origin = https://github.com/winterwind999/doc-pawi.git` | Verified | `git remote -v` |
| P1-003 | Select SDK-compatible dependencies | P1-001 | `package.json` | Installed with `npx expo install`; versions documented | Verified | TECHNICAL_REQUIREMENTS §1 |
| P1-004 | Configure NativeWind 4 | P1-003 | babel/metro/tailwind/css/types | `tsc` and lint pass; style-check screen renders on device | Implemented | Device rendering pending (P2-001) |
| P1-005 | Mascot and icons | — | Clean mascot, launcher/adaptive/monochrome/splash/notification icons | Mascot unchanged except background removal | Implemented | DESIGN_BRIEF §1 |
| P1-006 | Initial documentation | P1-003 | `docs/*.md`, README | All 11 documents + README exist and cross-link | Implemented | This folder |
| P1-007 | Windows native-build fixes | P1-003 | `plugins/withShortCxxPaths.js` | Native build passes MAX_PATH and memory limits | Implemented | Build in progress |

## Phase 2 — Minimal local AI proof

| ID | Objective | Depends on | Deliverable | Acceptance criteria | Status | Evidence / blockers |
|---|---|---|---|---|---|---|
| P2-001 | Android development build | P1-* | Debug APK installed on the phone | App launches on the physical device | In progress | First builds failed (MAX_PATH, RAM) and were fixed |
| P2-002 | Native module `doc-pawi-native` | P2-001 | Kotlin module | Compiles; SHA-256/PBKDF2/OCR/vault callable from JS | Implemented | Device test pending |
| P2-003 | Model download + verify | P2-002 | `model-store` | Download with progress; SHA-256 must match pinned catalog | Implemented | Device test pending |
| P2-004 | Load model + generate | P2-003 | `llama-engine` | Test prompt returns text with timings | Implemented | Device test pending |
| P2-005 | Inference in airplane mode | P2-004 | Test record | Test prompt works with networking disabled | Not started | — |

## Phase 3 — Secure local persistence

| ID | Objective | Depends on | Deliverable | Acceptance criteria | Status | Evidence / blockers |
|---|---|---|---|---|---|---|
| P3-001 | Schema + migrations | — | `migrations.ts` | All tables, constraints, indexes; idempotent; downgrade refused | Verified (unit) | `test/db.test.ts` (Node SQLite) |
| P3-002 | Repositories + transactions | P3-001 | `src/lib/db/repositories` | CRUD, cascades, rollback | Verified (unit) | `test/db.test.ts` |
| P3-003 | SQLCipher open with Keystore-protected key | P2-001 | `db/open.ts`, `profile-registry.ts` | DB opens only with key; `cipher_version` shown | Implemented | Device test pending |
| P3-004 | PIN + throttling + idle lock | P3-003 | `pin.ts`, `throttle.ts`, `(app)/_layout.tsx` | Lockouts persist; idle lock closes DB | Implemented (throttle logic Verified (unit)) | `test/logic.test.ts` |
| P3-005 | Profile isolation | P3-003 | Per-profile DB/key/PIN/vault key | Profiles cannot read each other | Implemented | Device test pending |

## Phase 4 — Core health workflow

| ID | Objective | Depends on | Deliverable | Acceptance criteria | Status | Evidence / blockers |
|---|---|---|---|---|---|---|
| P4-001 | Chat with streaming + stop | P2-004, P3-* | `chat-service`, chat screen | Streams; stop keeps partial; errors honest | Implemented (orchestration Verified (unit)) | `test/services.test.ts` |
| P4-002 | Local retrieval | P3-002 | `retrieval.ts` | Correct records, "Not recorded" for gaps, masked member IDs | Verified (unit) | `test/retrieval.test.ts` |
| P4-003 | Bounded agent tools | P4-001 | `agent-tools.ts` | Zod validation; unknown tools discarded | Verified (unit) | `test/proposals.test.ts` |
| P4-004 | Proposal confirm/reject | P4-003 | `proposal-service.ts`, `ProposalCard` | Nothing saved before confirm; edits re-validated | Verified (unit) | `test/proposals.test.ts` |
| P4-005 | Document import + encryption | P2-002 | `document-service.ts`, import screen | Encrypted vault file; plaintext cache removed | Implemented | Device test pending |
| P4-006 | On-device OCR (image + PDF) | P4-005 | Kotlin `DocumentOcr` | Synthetic report text recognized offline | Implemented | Device test pending |
| P4-007 | AI extraction + grounding + review | P4-006, P2-004 | `extraction.ts`, document screen | Valid JSON; Verify labels; confirm creates linked record | Implemented (grounding Verified (unit)) | `test/logic.test.ts` |

## Phase 5 — Application screens

| ID | Objective | Depends on | Deliverable | Acceptance criteria | Status | Evidence / blockers |
|---|---|---|---|---|---|---|
| P5-001 | Onboarding (7 steps) + welcome + unlock | P3-* | Screens | Matches APP_FLOW §1–2 | Implemented | Device test pending |
| P5-002 | Home | P3-002 | Screen | Data-driven message (Verified (unit)), doses, treatments, events, activity | Implemented | `test/logic.test.ts` |
| P5-003 | Records, vaccinations, treatments, documents | P3-002 | Screens | Search/filter, detail, provenance, timeline, delete confirm | Implemented | Device test pending |
| P5-004 | Meds | P3-002 | Screens | Today/active/archived/history, Taken/Skipped/Undo, archive/delete | Implemented (logic Verified (unit)) | `test/db.test.ts` |
| P5-005 | Doctors, HMO, facilities | P3-002 | Screens | CRUD, user-reported labels, map hand-off | Implemented | Device test pending |
| P5-006 | Profile, settings, about pages, model screen | P3-*, P2-* | Screens | Distinct sign-out / delete conversations / delete vault / remove model | Implemented | Device test pending |
| P5-007 | Synthetic demo data | P3-002 | `synthetic-data.ts` | Loads once, labelled, removable | Verified (unit) | `test/services.test.ts` |

## Phase 6 — Reminders and secondary integrations

| ID | Objective | Depends on | Deliverable | Acceptance criteria | Status | Evidence / blockers |
|---|---|---|---|---|---|---|
| P6-001 | Local reminders | P5-004 | `reminders.ts` | DAILY notifications; generic text by default; permission handling | Implemented | Device test pending |
| P6-002 | Biometric unlock | P3-004 | Settings + unlock | Enable requires biometric confirmation; PIN fallback | Implemented | Device test pending |
| P6-003 | Maps/phone/email hand-off | P5-005 | `MapHandoffButton` | Confirmation before maps; only address shared | Implemented | Device test pending |
| P6-004 | Google sign-in | P5-001 | `auth/google.ts` | Works when OAuth client configured | Implemented | **Blocked for verification:** requires the owner's Google Cloud OAuth client (package + SHA-1) |
| P6-005 | OpenMed clinical NER | — | — | — | Blocked | Not integrated (see TECHNICAL_REQUIREMENTS §4) |

## Phase 7 — Testing, documentation, demo preparation

| ID | Objective | Depends on | Deliverable | Acceptance criteria | Status | Evidence / blockers |
|---|---|---|---|---|---|---|
| P7-001 | Typecheck + lint + unit tests | All code | CI-style commands | All pass | Verified | TESTING §3 |
| P7-002 | Release APK | P2-001 | Signed release APK | Installs and runs without Metro | Not started | — |
| P7-003 | Device test pass (panelist cases) | P7-002 | TESTING §4 | PA-001…PA-012 executed with results recorded | Not started | — |
| P7-004 | Airplane-mode pass | P7-003 | TESTING §4 | Core workflow offline | Not started | — |
| P7-005 | Documentation update with real results | P7-003 | Updated docs | Statuses and measurements match reality | In progress | — |

## Phase 8 — Git delivery

| ID | Objective | Depends on | Deliverable | Acceptance criteria | Status | Evidence / blockers |
|---|---|---|---|---|---|---|
| P8-001 | Logical commits on `master` | — | Commits | Reviewed staged changes; no secrets/model/APK files | In progress | — |
| P8-002 | Push to `origin/master` after each phase | P8-001 | Remote branch | `git push origin master` succeeds without force | In progress | — |
| P8-003 | Final report | P8-002 | Summary | Hashes, push results, clean tree | Not started | — |
