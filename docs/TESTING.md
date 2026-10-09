# Doc Pawi — Developer Testing

> **Audience:** developers and maintainers. Evaluators should use the [Panelist Testing Guide](PANELIST_TESTING_GUIDE.md).
> Related: [Implementation Plan](IMPLEMENTATION_PLAN.md) · [Technical Requirements](TECHNICAL_REQUIREMENTS.md)

Every result below states **what kind of test** it is:
- **Unit (Node)** — Jest in Node. Database tests use the real migrations and repositories on Node's built-in `node:sqlite` (not SQLCipher). The language model is replaced by a scripted stand-in, so these tests verify orchestration and validation, **not** model quality.
- **Device** — run on the physical Android phone with the real model, SQLCipher, ML Kit, and Keystore.

## 1. Test environment

| Item | Value |
|---|---|
| Development machine | Windows 11, Node 24.18.0, npm 11.9.0, JDK 17 (Temurin 17.0.20.1) for Gradle, Android SDK (platform 36, build-tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1) |
| Physical device | HONOR JDY-LX2 — Android 16 (API 36), MediaTek Helio G85 (MT6769V/CZ; 2× Cortex-A75 + 6× Cortex-A55), ~6 GB RAM, arm64-v8a, 720 × 1612 px @ 320 dpi (360 × 806 dp) |

## 2. Commands

```powershell
# Install (PowerShell or cmd — NOT Git Bash: llama.rn's postinstall needs Windows tar)
npm install

npm run typecheck      # tsc --noEmit
npm run lint           # expo lint (ESLint 9 + eslint-config-expo, React Compiler rules)
npm test               # Jest (jest-expo preset), test/**/*.test.ts
npm run check          # all three

# Native Android build (generates android/ via CNG)
npx expo prebuild --platform android --clean
cd android
$env:JAVA_HOME = "<path to JDK 17>"; $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat assembleDebug --max-workers=2     # development build (needs Metro: npx expo start)
.\gradlew.bat assembleRelease --max-workers=2   # standalone APK (JS bundled)

# Install and run on a USB-connected phone
adb install -r app\build\outputs\apk\release\app-release.apk
```

On Windows, `plugins/withShortCxxPaths.js` shortens CMake staging paths (`%LOCALAPPDATA%\dpcxx`, or `DOC_PAWI_CXX_ROOT` if set) and limits parallel C++ compiles (`DOC_PAWI_CXX_JOBS`, default 2); the first native build takes a long time and needs roughly 10 GB of free disk space across the project folder, the CMake staging folder, and the Gradle cache.

## 3. Automated results

| Command | Kind | Result | Date |
|---|---|---|---|
| `npm run typecheck` | Static | ✅ 0 errors | 2026-10-09 |
| `npm run lint` | Static | ✅ 0 problems | 2026-10-09 |
| `npm test` | Unit (Node) | ✅ 5 suites, **57 tests passed** | 2026-10-09 |

Test suites ([`test/`](../test)):

| Suite | Covers |
|---|---|
| `db.test.ts` | Migrations (tables, idempotency, downgrade refusal), CHECK and FK constraints, transaction rollback, profile/settings, record CRUD + search/filter + LIKE escaping, conversation cascade, treatment events ordering, medication schedules, dose slots, Taken/Skipped distinctness, correction/undo, archive keeps history, permanent delete, doctor–HMO links, input validation |
| `proposals.test.ts` | Nothing saved while pending, confirm creates exactly one record, double-confirm prevented, reject saves nothing, invalid edits write nothing, vaccine series reuse, malformed/unknown tool calls, impossible dates, stripping of unexpected fields |
| `retrieval.test.ts` | Intent/keyword detection, exact demo dates in context, lab values, medications with today's dose state, "Not recorded" lines, HMO member-ID masking, static system prompt |
| `logic.test.ts` | Extraction grounding ("Verify" flags), normalization, proposal building, JSON parsing, emergency + dose-change detection, date handling (leap years, boundaries, ages, 12-hour times), PIN throttling, data-driven Home message |
| `services.test.ts` | Chat orchestration with a scripted model: metadata + sources persisted, tool call → pending proposal (no record), invalid tool discarded, stop keeps partial text, model errors recorded honestly; synthetic demo data load/remove |

Not covered by automated tests: React component rendering (NativeWind is disabled under Jest), SQLCipher encryption itself, native Kotlin code, real model output, notifications, permissions. These are verified on the device (§4).

## 4. On-device results

Procedure: install the build on the test phone over USB, complete onboarding, and run the [panelist cases](PANELIST_TESTING_GUIDE.md#5-core-test-cases). Model timings are the llama.cpp values the app displays (prompt tokens/s, generated tokens/s).

| Check | Result | Evidence |
|---|---|---|
| Debug build installs and launches | _pending_ | |
| NativeWind style check renders natively | _pending_ | |
| Onboarding (local-only profile) + SQLCipher DB created | _pending_ | |
| Model download + SHA-256 verification in app | _pending_ | |
| Model load + test prompt (timings) | _pending_ | |
| Chat answer from local records (synthetic data) | _pending_ | |
| Chat proposal confirm / reject | _pending_ | |
| Document OCR + AI extraction (synthetic report) | _pending_ | |
| Airplane mode: chat, OCR, records | _pending_ | |
| Restart persistence + PIN unlock offline | _pending_ | |
| Medication Taken/Skipped + history | _pending_ | |
| Reminder notification | _pending_ | |

## 5. Checklist

| Area | How verified | Status |
|---|---|---|
| Database migrations | Unit (Node) | ✅ |
| Record CRUD | Unit (Node) | ✅ / device pending |
| Conversation persistence | Unit (Node) | ✅ / device pending |
| Local retrieval | Unit (Node) | ✅ |
| Model loading and failures | Device | pending |
| Invalid agent tool calls | Unit (Node) | ✅ |
| User confirmation before writes | Unit (Node) | ✅ / device pending |
| Medication dose history | Unit (Node) | ✅ / device pending |
| Treatment and vaccination history | Unit (Node) | ✅ / device pending |
| Date and time-zone handling | Unit (Node) — local wall-clock slots, calendar validation | ✅ |
| Authentication and local unlock | Device (local-only profile); Google sign-in requires OAuth configuration | pending |
| Profile isolation | Design (separate DB/key/PIN/vault key per profile); device check | pending |
| Sensitive-data logging | Code review: no `console.*` of prompts, OCR text, or records; no analytics SDK | ✅ |
| NativeWind rendering | Device (Style check screen) | pending |
| Android build success | Device | pending |
| Airplane-mode behavior | Device | pending |
