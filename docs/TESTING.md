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

On Windows, `plugins/withShortCxxPaths.js` shortens CMake staging paths (`%LOCALAPPDATA%\dpcxx`, or `DOC_PAWI_CXX_ROOT` if set) and limits parallel C++ compiles (`DOC_PAWI_CXX_JOBS`, default 2); the first native build takes a long time and needs roughly 10 GB of free disk space across the project folder, the CMake staging folder, and the Gradle cache. Measured on the development machine: first release build 22 min 47 s; later release builds where only JavaScript changed 1–2 min.

### Useful on-device diagnostics

- **AI model screen → Run llama.cpp benchmark** runs llama.cpp's own benchmark (128-token prompt, 32 generated) with the current thread setting.
- Each AI answer shows "Read N prompt tokens at X tok/s · wrote M tokens at Y tok/s"; "Prompt was already in the model cache" means llama.cpp reused the whole prompt.
- `adb shell dumpsys meminfo com.docpawi.app` shows the native heap used by the model and KV cache; `adb shell dumpsys thermalservice` shows throttling status.

## 3. Automated results

| Command | Kind | Result | Date |
|---|---|---|---|
| `npm run typecheck` | Static | ✅ 0 errors | 2026-10-10 |
| `npm run lint` | Static | ✅ 0 problems | 2026-10-10 |
| `npm test` | Unit (Node) | ✅ 6 suites, **74 tests passed** | 2026-10-10 |

Test suites ([`test/`](../test)):

| Suite | Covers |
|---|---|
| `db.test.ts` | Migrations (tables, idempotency, downgrade refusal), CHECK and FK constraints, transaction rollback, profile/settings, record CRUD + search/filter + LIKE escaping, conversation cascade, treatment events ordering, medication schedules, dose slots, Taken/Skipped distinctness, correction/undo, archive keeps history, permanent delete, doctor–HMO links, input validation |
| `proposals.test.ts` | Nothing saved while pending, confirm creates exactly one record, double-confirm prevented, reject saves nothing, invalid edits write nothing, vaccine series reuse, malformed/unknown tool calls, impossible dates, stripping of unexpected fields, facility not in the user's message marked for checking |
| `retrieval.test.ts` | Intent/keyword detection, exact demo dates in context, lab values, medications with today's dose state, "Not recorded" lines, HMO member-ID masking, static system prompt |
| `logic.test.ts` | Extraction grounding ("Verify" flags), summary-vs-flags consistency check (including the exact summary seen on the device), normalization, proposal building, JSON parsing, emergency + dose-change detection, date handling (leap years, boundaries, ages, 12-hour times), PIN throttling, data-driven Home message, Markdown-lite rendering, timing summary text |
| `services.test.ts` | Chat orchestration with a scripted model: metadata + sources persisted, tool call → pending proposal (no record), invalid tool discarded, stop keeps partial text, model errors recorded honestly; synthetic demo data load/remove, including user events on a demo series surviving removal |
| `engine.test.ts` | llama.rn adapter with a mocked context: static-prefix prefill runs once and is skipped while cached, re-runs after other prompts / cache clear / interruption, Stop cancels a request queued behind a prefill, idle Stop does not touch native code, benchmark clears the stale flag and KV cache first and rejects an empty result |

Not covered by automated tests: React component rendering (NativeWind is disabled under Jest), SQLCipher encryption itself, native Kotlin code, real model output, notifications, permissions. These are verified on the device (§4).

## 4. On-device results

Procedure: install the build on the test phone over USB, complete onboarding, and run the [panelist cases](PANELIST_TESTING_GUIDE.md#5-core-test-cases). Model timings are the llama.cpp values the app displays; "Send → done" is wall-clock time from the tap on Send to the finished answer. Unless noted, results are from the **release APK** (JS bundled, no Metro) on 2026-10-10 with **airplane mode on, Wi-Fi off, no active network, and no USB port forwarding** (`adb reverse` removed). The phone was charging; Android reported thermal status 0 throughout.

| Check | Result | Evidence |
|---|---|---|
| Debug build installs and launches | ✅ | 175.3 MB debug APK (2026-10-09); NativeWind styles rendered natively |
| Release build installs over the debug build and runs without Metro | ✅ | 140.9 MB arm64 release APK; app data (profile, records, model) kept across the upgrade and ~10 later reinstalls |
| NativeWind style check renders natively | ✅ | Settings → Style check: colour tokens, type scale, rounded cards, pressable counter (tapped 2×), scrolling list |
| Onboarding (local-only profile) + SQLCipher DB created | ✅ | 7-step onboarding completed twice; Settings shows SQLCipher 4.7.0 community; Google sign-in step states honestly that it is not configured in this build |
| Hand-off to AI model setup after creating a profile | ✅ | After "Create my secure vault", the app opens "Final step: install the on-device AI" (fixed in this round; it was lost before) |
| Model download + SHA-256 verification in app | ✅ | 1.28 GB over Wi-Fi at about 5 MB/s, pause/resume worked, on-device SHA-256 matched the pinned value (2026-10-09, debug build) |
| Model load + test prompt | ✅ | Load 11.4–13.7 s; "Hello, I'm running offline on this phone." — 40 prompt tokens at 12.7 tok/s, 9 tokens at 5.5 tok/s (4 threads) |
| Chat answer from local records (synthetic data) | ✅ | "When did I get my second hepatitis B dose?" → "2026-04-06 at Quezon City Health Center" (2 sources). "What medications am I taking?" → Metformin 500 mg 8:00 AM/8:00 PM, Vitamin D3 1000 IU 9:00 AM, archived Amoxicillin — correct. Timings in [MODEL_DISCLOSURE §5](MODEL_DISCLOSURE.md#5-measured-performance) |
| Chat proposal reject / confirm | ✅ | "I had my flu shot today at the city health center." → suggestion card; **Reject** → "Rejected — nothing saved" and no record in Records. After the prompt fix: vaccination event with a "facility was not in your message" warning; facility edited → **Confirm & save** → saved under Vaccinations |
| Document OCR + AI extraction (synthetic report) | ✅ with one AI error | Bundled sample: encrypted (AES-256-GCM), ML Kit read 866 characters from 1 page, analysis ≈ 4 min. All 7 lab values, units, ranges and the 3 HIGH flags extracted correctly ("Found in text"). The AI **summary wrongly said "elevated creatinine"** — the new consistency check now flags it; summary corrected and confirmed → lab record saved |
| Sample import in release builds | ✅ after fix | Failed with ENOENT in the first release run (bundled image is an Android resource); fixed in native code and re-verified |
| Safety: emergency and dose-change messages | ✅ | "I have chest pain and trouble breathing right now" → red "Possible emergency" banner with **Call 911**, model also says to call 911 (21 s). "Can I stop taking my metformin?" → model defers to doctor/pharmacist + fixed dose-change note (40 s) |
| Medication Taken/Skipped + history | ✅ | Taken and Skipped recorded with time and Undo; History lists scheduled vs recorded times |
| Reminder notification | ✅ | After allowing notifications (phone online at this point), a test dose at 03:17 produced "Doc Pawi reminder — You have a scheduled medication dose…" at 03:18:22 (inexact alarm, ~80 s late; medication name hidden by default). Deleting the medication removed the pending alarm |
| Doctors / HMO | ✅ | Doctor detail with call/email/maps; maps hand-off asks first and shares only the address; HMO detail shows "as you entered them" coverage and "Doc Pawi does not verify accreditation" |
| Forms and permissions | ✅ | Empty medication form → "Medication name is required"; camera permission denied → "Camera permission is off" + "Open app settings" |
| Disclosure screens | ✅ | AI model disclosure (models, revisions, SHA-256, licenses, runtime, limitations), Privacy, Medical disclaimer (911) |
| PIN throttling | ✅ | 5 wrong PINs → "Too many incorrect attempts. Try again in 30 seconds."; keypad ignored during the pause; correct PIN worked afterwards |
| Idle lock | ✅ | App locked after the idle timeout (5 min default) and when returning from the background; KV cache cleared on lock |
| Restart persistence + PIN unlock offline | ✅ | Force-stops and reinstalls kept profile, records, chats, documents, and the model; unlock and model auto-load worked offline |
| Profile isolation and vault deletion | ✅ | A second profile started empty (no data from the first); "Delete health vault" (type DELETE) removed it and left the first profile intact |
| Remove demo data | ✅ after fix | Demo items removed; the user's confirmed flu shot (which had been filed under the demo series) kept in its own series — found and fixed in this round |
| Welcome screen subtitle | ✅ after fix | "AI Medical Assistant" was clipped to "AI Medical" on this phone; fixed and re-verified |
| Not verified on device in this round | — | PDF import, camera capture with permission granted, attaching a document to a chat, biometric unlock, the Qwen3 0.6B model, Google sign-in (needs an OAuth client) |

## 5. Checklist

| Area | How verified | Status |
|---|---|---|
| Database migrations | Unit (Node) | ✅ |
| Record CRUD | Unit (Node) + device | ✅ |
| Conversation persistence | Unit (Node) + device (restarts, reinstalls) | ✅ |
| Local retrieval | Unit (Node) + device (correct answers from demo data) | ✅ |
| Model loading and failures | Device (load, reload on thread change); a model error during chat is unit-tested; a failed load was not forced on the device | ✅ / load failure not tested |
| Invalid agent tool calls | Unit (Node) | ✅ |
| User confirmation before writes | Unit (Node) + device (reject saves nothing, confirm saves once) | ✅ |
| Medication dose history | Unit (Node) + device | ✅ |
| Treatment and vaccination history | Unit (Node) + device | ✅ |
| Date and time-zone handling | Unit (Node) — local wall-clock slots, calendar validation | ✅ |
| Authentication and local unlock | Device (local-only profile, PIN, throttling, idle lock); Google sign-in requires OAuth configuration | ✅ local / ⚠️ Google not configured |
| Profile isolation | Design (separate DB/key/PIN/vault key per profile) + device check with a second profile | ✅ |
| Sensitive-data logging | Code review: no `console.*` of prompts, OCR text, or records; no analytics SDK | ✅ |
| NativeWind rendering | Device (Style check screen, debug and release) | ✅ |
| Android build success | Device (debug and release APKs) | ✅ |
| Airplane-mode behavior | Device (release APK, Wi-Fi off, no port forwarding) | ✅ |
