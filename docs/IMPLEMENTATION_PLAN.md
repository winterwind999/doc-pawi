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
| P1-004 | Configure NativeWind 4 | P1-003 | babel/metro/tailwind/css/types | `tsc` and lint pass; style-check screen renders on device | Verified | Style check screen on the phone (debug and release APKs) |
| P1-005 | Mascot and icons | — | Clean mascot, launcher/adaptive/monochrome/splash/notification icons | Mascot unchanged except background removal | Implemented | DESIGN_BRIEF §1 |
| P1-006 | Initial documentation | P1-003 | `docs/*.md`, README | All 11 documents + README exist and cross-link | Verified | This folder; updated with device results (P7-005) |
| P1-007 | Windows native-build fixes | P1-003 | `plugins/withShortCxxPaths.js` | Native build passes MAX_PATH and memory limits | Verified | Debug and release builds succeed on Windows 11 (first release build 22 min 47 s) |

## Phase 2 — Minimal local AI proof

| ID | Objective | Depends on | Deliverable | Acceptance criteria | Status | Evidence / blockers |
|---|---|---|---|---|---|---|
| P2-001 | Android development build | P1-* | Debug APK installed on the phone | App launches on the physical device | Verified | 175.3 MB debug APK launched on the HONOR JDY-LX2 |
| P2-002 | Native module `doc-pawi-native` | P2-001 | Kotlin module | Compiles; SHA-256/PBKDF2/OCR/vault callable from JS | Verified | PIN (PBKDF2), model SHA-256, OCR, and vault encryption used on the phone |
| P2-003 | Model download + verify | P2-002 | `model-store` | Download with progress; SHA-256 must match pinned catalog | Verified | 1.28 GB download with pause/resume; on-device SHA-256 matched |
| P2-004 | Load model + generate | P2-003 | `llama-engine` | Test prompt returns text with timings | Verified | Load 11–14 s; test prompt with timings (MODEL_DISCLOSURE §5) |
| P2-005 | Inference in airplane mode | P2-004 | Test record | Test prompt works with networking disabled | Verified | Release APK, airplane mode, Wi-Fi off, no port forwarding |

## Phase 3 — Secure local persistence

| ID | Objective | Depends on | Deliverable | Acceptance criteria | Status | Evidence / blockers |
|---|---|---|---|---|---|---|
| P3-001 | Schema + migrations | — | `migrations.ts` | All tables, constraints, indexes; idempotent; downgrade refused | Verified (unit) | `test/db.test.ts` (Node SQLite) |
| P3-002 | Repositories + transactions | P3-001 | `src/lib/db/repositories` | CRUD, cascades, rollback | Verified (unit) | `test/db.test.ts` |
| P3-003 | SQLCipher open with Keystore-protected key | P2-001 | `db/open.ts`, `profile-registry.ts` | DB opens only with key; `cipher_version` shown | Verified | Settings shows SQLCipher 4.7.0 community |
| P3-004 | PIN + throttling + idle lock | P3-003 | `pin.ts`, `throttle.ts`, `(app)/_layout.tsx` | Lockouts persist; idle lock closes DB | Verified | Unit tests + phone: 5 wrong PINs → 30 s pause; idle lock observed |
| P3-005 | Profile isolation | P3-003 | Per-profile DB/key/PIN/vault key | Profiles cannot read each other | Verified | Second profile started empty; deleting its vault left the first intact |

## Phase 4 — Core health workflow

| ID | Objective | Depends on | Deliverable | Acceptance criteria | Status | Evidence / blockers |
|---|---|---|---|---|---|---|
| P4-001 | Chat with streaming + stop | P2-004, P3-* | `chat-service`, chat screen | Streams; stop keeps partial; errors honest | Verified (streaming on device; stop unit-tested) | `test/services.test.ts`, `test/engine.test.ts`, TESTING §4 |
| P4-002 | Local retrieval | P3-002 | `retrieval.ts` | Correct records, "Not recorded" for gaps, masked member IDs | Verified | `test/retrieval.test.ts`; correct answers from demo data on the phone |
| P4-003 | Bounded agent tools | P4-001 | `agent-tools.ts` | Zod validation; unknown tools discarded | Verified (unit) | `test/proposals.test.ts` |
| P4-004 | Proposal confirm/reject | P4-003 | `proposal-service.ts`, `ProposalCard` | Nothing saved before confirm; edits re-validated | Verified | `test/proposals.test.ts`; reject and edit-then-confirm on the phone |
| P4-005 | Document import + encryption | P2-002 | `document-service.ts`, import screen | Encrypted vault file; plaintext cache removed | Verified (bundled sample) | Release fix for bundled resources (P7-007); camera/gallery/PDF not tested on device |
| P4-006 | On-device OCR (image + PDF) | P4-005 | Kotlin `DocumentOcr` | Synthetic report text recognized offline | Verified (image) | 866 characters from the sample image offline; PDF not tested on device |
| P4-007 | AI extraction + grounding + review | P4-006, P2-004 | `extraction.ts`, document screen | Valid JSON; Verify labels; confirm creates linked record | Verified | 7/7 values correct on the phone; summary error caught by P7-008 |

## Phase 5 — Application screens

| ID | Objective | Depends on | Deliverable | Acceptance criteria | Status | Evidence / blockers |
|---|---|---|---|---|---|---|
| P5-001 | Onboarding (7 steps) + welcome + unlock | P3-* | Screens | Matches APP_FLOW §1–2 | Verified | Two profiles created on the phone |
| P5-002 | Home | P3-002 | Screen | Data-driven message (Verified (unit)), doses, treatments, events, activity | Verified | `test/logic.test.ts`; phone |
| P5-003 | Records, vaccinations, treatments, documents | P3-002 | Screens | Search/filter, detail, provenance, timeline, delete confirm | Verified (lists, detail, provenance) | Search/filter unit-tested only |
| P5-004 | Meds | P3-002 | Screens | Today/active/archived/history, Taken/Skipped/Undo, archive/delete | Verified | `test/db.test.ts`; phone (archive action unit-tested only) |
| P5-005 | Doctors, HMO, facilities | P3-002 | Screens | CRUD, user-reported labels, map hand-off | Verified (viewing, labels, hand-off) | Create/edit not exercised on the phone |
| P5-006 | Profile, settings, about pages, model screen | P3-*, P2-* | Screens | Distinct sign-out / delete conversations / delete vault / remove model | Verified (settings, about pages, model screen, delete vault) | Sign-out, delete conversations, and remove model not exercised on the phone |
| P5-007 | Synthetic demo data | P3-002 | `synthetic-data.ts` | Loads once, labelled, removable | Verified | `test/services.test.ts`; load and remove on the phone (P7-010) |

## Phase 6 — Reminders and secondary integrations

| ID | Objective | Depends on | Deliverable | Acceptance criteria | Status | Evidence / blockers |
|---|---|---|---|---|---|---|
| P6-001 | Local reminders | P5-004 | `reminders.ts` | DAILY notifications; generic text by default; permission handling | Verified | Reminder posted ~80 s after its time (inexact alarm), generic text; alarm removed when the medication was deleted |
| P6-002 | Biometric unlock | P3-004 | Settings + unlock | Enable requires biometric confirmation; PIN fallback | Implemented | Not verified on the device |
| P6-003 | Maps/phone/email hand-off | P5-005 | `MapHandoffButton` | Confirmation before maps; only address shared | Verified (maps dialog) | The maps app itself was not opened (offline) |
| P6-004 | ~~Google sign-in~~ | P5-001 | — | — | Removed | Dropped at the owner's request (2026-10-10): profiles are local-only; see P9-002 |

## Phase 7 — Testing, documentation, demo preparation

| ID | Objective | Depends on | Deliverable | Acceptance criteria | Status | Evidence / blockers |
|---|---|---|---|---|---|---|
| P7-001 | Typecheck + lint + unit tests | All code | CI-style commands | All pass | Verified | TESTING §3 |
| P7-002 | Release APK | P2-001 | Signed release APK | Installs and runs without Metro | Verified | 140.9 MB arm64 APK (debug keystore) |
| P7-003 | Device test pass (panelist cases) | P7-002 | TESTING §4 | PA-001…PA-012 executed with results recorded | Verified | PANELIST_TESTING_GUIDE §6.1 (PA-004 partly run) |
| P7-004 | Airplane-mode pass | P7-003 | TESTING §4 | Core workflow offline | Verified | Release APK, airplane mode, Wi-Fi off |
| P7-005 | Documentation update with real results | P7-003 | Updated docs | Statuses and measurements match reality | Verified | TESTING, MODEL_DISCLOSURE, LOCAL_AI_ARCHITECTURE, guide, README, this plan |
| P7-006 | Faster chat answers | P7-003 | Prefill of the static prompt, q8_0 KV cache, shorter tool definitions, thread setting | First answer in a new chat clearly faster | Verified | 91 s → 47 s for the same question (MODEL_DISCLOSURE §5); `test/engine.test.ts` |
| P7-007 | Bundled sample import in release builds | P7-003 | Native resource fallback | Sample imports in the release APK | Verified | Failed with ENOENT before the fix; works after |
| P7-008 | Summary contradicts extracted flags | P7-003 | Deterministic consistency check + warning | "elevated creatinine" for an unflagged value is flagged | Verified | `test/logic.test.ts`; warning shown and cleared after editing on the phone |
| P7-009 | Chat suggestion routing and invented facility | P7-003 | Tool routing in the system prompt; facility check | Flu shot → vaccination event; unsaid facility marked | Verified | `test/proposals.test.ts`; phone |
| P7-010 | User events lost when removing demo data | P7-003 | Re-home user events; never match demo series | User's flu shot survives removal | Verified | `test/services.test.ts`; phone |
| P7-011 | Benchmark returned no result after a chat or lock | P7-003 | Clear interrupted flag and KV cache first | Benchmark works after a chat | Verified | `test/engine.test.ts`; 1,024-token benchmark on the phone |
| P7-012 | Small UI defects | P7-003 | PIN pad 3×4 grid, post-setup hand-off, clipped welcome subtitle, Markdown in answers, cache-hit timing text | Rendered correctly on the phone | Verified | Screenshots during the device pass |

## Phase 8 — Git delivery

| ID | Objective | Depends on | Deliverable | Acceptance criteria | Status | Evidence / blockers |
|---|---|---|---|---|---|---|
| P8-001 | Logical commits on `master` | — | Commits | Reviewed staged changes; no secrets/model/APK files | Verified | `git log`; the owner's uncommitted `app.json` EAS lines were never committed |
| P8-002 | Push to `origin/master` after each phase | P8-001 | Remote branch | `git push origin master` succeeds without force | Verified | Fast-forward pushes only |
| P8-003 | Final report | P8-002 | Summary | Hashes, push results, clean tree | Verified | Delivered with the first round's last push |

## Phase 9 — Follow-up requests (2026-10-10)

Requested by the owner after the first device round. Evidence: [TESTING.md §4.1](TESTING.md#41-second-round-the-follow-up-requests).

| ID | Request | Deliverable | Status | Evidence / notes |
|---|---|---|---|---|
| P9-001 | Pick dates instead of typing them; show dates as "Oct 4, 2026" | `DateField` / `TimeField` on `@expo/ui`'s `DateTimePicker` with limits and quick picks; `formatDate` everywhere, also in AI text | Verified | Birth date, treatment, medication, HMO validity, records; `test/logic.test.ts` |
| P9-002 | Remove Google sign-in and OAuth | Sign-in screen and library removed; 6-step onboarding; local-only texts | Verified | Onboarding on the phone |
| P9-003 | Remove mentions of a model family the project never used | Code and docs | Verified | A repository-wide search finds no mention |
| P9-004 | Recommended model first; quantized models | `recommendModel` by RAM; "Recommended for this phone" section; quantization note | Verified | "This phone reports 6.1 GB of RAM …"; `test/logic.test.ts` |
| P9-005 | Map of the nearest accredited clinics, hospitals, labs | Migration v3 coordinates, facility location (GPS, address lookup, coordinates, tap), `TileMap` on OpenStreetMap tiles, nearby list | Verified (pinch not testable over adb) | `test/geo.test.ts`, `test/db.test.ts`; OSM blocked a User-Agent containing "offline" — fixed |
| P9-006 | Keyboard hides the chat input | keyboard-controller views; explicit header offset in chat; suggestions above fields | Verified | Forms, onboarding, chat |
| P9-007 | Show when a message was sent | Tap a sent bubble → "Sent Oct 10, 2026, 4:48 AM" | Verified | Phone |
| P9-008 | Wrong dates and slow answer for "last week Monday … thursday" | App-side relative dates + "Check the date" warning; parallel tool calls; vaccine shots filed as doses; shorter replies | Verified | Sep 28 and Oct 1 in one *Rabies vaccine* series, 84 s instead of about 3 min; `test/relative-dates.test.ts`, `test/services.test.ts`, `test/proposals.test.ts` |
| P9-009 | Doctor form: camera or gallery, specialty suggestions, 5 phones and 5 emails; back stack after editing | `OptionDialog`, `suggestSpecialties`, per-field validation, `router.back()` after editing | Verified | Phone |
| P9-010 | Treatments "+ Add" label | Single-line labels in shared components | Verified | "+ Add treatment" on the phone |
| P9-011 | Attachments: processing state and several documents | Migration v2 `message_attachments` (up to 3), states in the picker, import times | Verified (two documents) | `test/db.test.ts`, `test/services.test.ts` |
| P9-012 | Proprietary license | `LICENSE` (all rights reserved) and `"license": "UNLICENSED"` | Done | Holder named as the GitHub account owner |
