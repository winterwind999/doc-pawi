# Doc Pawi — AI Medical Assistant

<img src="assets/images/doc-pawi-mascot.png" alt="Doc Pawi mascot: a sea turtle in a doctor's coat" width="120" align="right" />

**An offline-first Android health companion whose AI runs on the phone.** Doc Pawi keeps your medical records, documents, medications, and conversations in an encrypted vault on your device, and uses a local language model (Qwen3 via llama.cpp) plus on-device OCR to answer questions about your own history, read medical documents, and suggest records that you confirm before anything is saved.

> **Panelists and judges:** start with the **[Panelist Testing Guide](docs/PANELIST_TESTING_GUIDE.md)**. Prepare while online (install the app, create a local profile, download the model once, load the synthetic demo data), then switch on **airplane mode** to evaluate the core workflow.

> **Medical disclaimer:** Doc Pawi provides health information and personal record keeping. It is not a substitute for licensed healthcare professionals, does not diagnose, and never prescribes or changes doses. In an emergency, call **911** (Philippines) or your local emergency number.

## Why

Medical information is scattered across paper results, photos, and conversations; dates of vaccine doses and treatments are easy to forget; internet access is not always available; and uploading lab results to cloud AI services is a privacy risk. Doc Pawi brings the AI to the data instead of the data to the AI.

## Local AI value proposition

| | |
|---|---|
| **On-device inference** | Qwen3 1.7B (Q4_K_M GGUF, Apache-2.0) runs on the phone CPU through llama.cpp (`llama.rn`). No cloud AI API exists in the code. |
| **Grounded in your records** | A local retrieval step pulls your relevant records (vaccinations, treatments, meds, labs, doctors, HMO) into the prompt and says explicitly when something is *not recorded*. |
| **Local document understanding** | Google ML Kit on-device OCR (images and PDF pages) → JSON-schema-constrained extraction by the local model → every value checked against the recognized text. |
| **Human in the loop** | The model can only *propose* records/events (Zod-validated); nothing is saved until you confirm. |
| **Verifiable** | The app shows the model file, pinned commit, SHA-256, llama.cpp build, CPU library, and tokens/s for every answer. Works in airplane mode. |

## Features

Status legend: **Verified** = tested on the physical Android device (HONOR JDY-LX2, release APK, airplane mode, 2026-10-10) · **Implemented** = complete, not yet verified on the device · see [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) and [Testing](docs/TESTING.md#4-on-device-results).

| Feature | Status |
|---|---|
| Onboarding: local-only profile, 4-digit PIN, profile (sex, DOB, height/weight with units), privacy disclosure, secure storage setup, hand-off to AI model setup | Verified |
| Google sign-in | Implemented — requires an OAuth client; not verified |
| PIN unlock offline with persistent throttling, idle auto-lock, sign-out, profile switching | Verified |
| Biometric unlock (optional) | Implemented — not verified on the device |
| Encrypted SQLCipher database per profile (Keystore-protected random key), AES-256-GCM document vault | Verified (SQLCipher 4.7.0 reported by the app; documents stored in the encrypted vault) |
| Home: date, greeting, mascot, data-driven message, today's doses, ongoing treatments, upcoming events | Verified |
| Chats: streaming local answers, history, local-record retrieval with sources, AI proposals with confirm/edit/reject, emergency and dose-change safety notes, per-answer speed | Verified |
| Chat: stop button, attaching a processed document to a question | Implemented — not verified on the device |
| Documents: sample import, on-device OCR, AI summary + field extraction with "Verify" labels, summary consistency warning, review and confirm | Verified (bundled sample image) |
| Documents: camera, gallery, and PDF import | Implemented — camera permission-denied path verified; capture and PDF not verified |
| Records, vaccinations, treatment timelines, provenance labels | Verified · search/filter/edit unit-tested |
| Meds: schedules, Taken/Skipped history with Undo, delete, local reminders (generic lock-screen text) | Verified · archiving unit-tested |
| Doctors and HMO (user-reported links, facilities, map/call/email hand-off) | Verified |
| Model setup: pinned download with progress/pause/resume, SHA-256 verification, load/unload, CPU-thread setting, test prompt, llama.cpp benchmark, device info | Verified (Qwen3 1.7B; the 0.6B model was not tested) |
| Synthetic demo data for evaluation (load and remove, keeping user entries) | Verified |
| Unit and database tests (74 passing) | Verified (Node) |

## Technology

Expo SDK 57 · React Native 0.86 (New Architecture) · TypeScript 6 · Expo Router · NativeWind 4 + Tailwind CSS 3 · `llama.rn` 0.12.9 / llama.cpp b10256 · Qwen3 GGUF · Google ML Kit Text Recognition v2 (bundled) · expo-sqlite with SQLCipher · expo-secure-store / Android Keystore · Zod · Zustand · a local Kotlin Expo module (`modules/doc-pawi-native`). Details and versions: [Technical Requirements](docs/TECHNICAL_REQUIREMENTS.md).

## Local AI architecture (short)

```
Question → safety checks → local retrieval (SQLCipher) → Qwen3 on-device (llama.cpp, CPU)
        → streamed answer + sources + timings
        → optional tool call → Zod validation → pending proposal → you confirm → record saved

Document → AES-GCM vault → ML Kit OCR on device → Qwen3 JSON extraction → grounding check
        → review screen (Verify labels) → you confirm → record saved (linked to the document)
```

Full description, diagrams, and safety controls: [Local AI Architecture](docs/LOCAL_AI_ARCHITECTURE.md).

## Getting started (developers)

### Prerequisites
- Node.js 20.19+ (tested with 24.18) and npm
- Android SDK (platform 36, NDK 27.1, CMake 3.22.1) and **JDK 17**
- An arm64 Android phone with USB debugging (Expo Go is **not** supported: the app uses native modules)
- ~6 GB free RAM for the first native build on Windows

### Install
```powershell
git clone https://github.com/winterwind999/doc-pawi.git
cd doc-pawi
npm install        # On Windows use PowerShell or cmd, not Git Bash (llama.rn's postinstall extracts native libs with tar)
```

### Configure (optional)
Copy `.env.example` to `.env.local`. No secrets are needed. Google sign-in stays disabled unless you set `EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED=true` **and** create an Android OAuth client in Google Cloud for package `com.docpawi.app` with your signing key's SHA-1 (otherwise Google returns `DEVELOPER_ERROR`). The local-only profile always works.

### Run a development build
```powershell
npx expo prebuild --platform android --clean
npx expo run:android            # builds, installs, and starts Metro
```

### Build a standalone APK
```powershell
cd android
$env:JAVA_HOME = "<JDK 17 path>"; $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat assembleRelease --max-workers=2
# output: android\app\build\outputs\apk\release\app-release.apk
```
The release build is signed with the debug keystore (suitable for evaluation, not for Play Store distribution).

### Checks
```powershell
npm run typecheck; npm run lint; npm test
```

### AI model
Models are **not** in the repository. Install from the app: Settings → *Manage AI model* → *Download* (Qwen3 1.7B Q4_K_M, 1.28 GB, pinned to `ggml-org/Qwen3-1.7B-GGUF@daeb8e2d…`, SHA-256 `d2387ca2…bc7b5`). See [Model Disclosure](docs/MODEL_DISCLOSURE.md).

## Quick demo (5 steps)
1. Create a local-only profile and PIN.
2. Download and load the model; run the test prompt.
3. Settings → *Load synthetic demo data*.
4. Airplane mode → Chats: "When did I get my second hepatitis B dose?" (expected: 2026-04-06).
5. Records → Import document → *Try the synthetic sample report* → review → Confirm.

## Known limitations
- AI is slow on mid-range phones. On the test phone (Helio G85): opening Chats prepares the model for 30–50 s in the background, an answer then takes about 20–60 s, and analysing a one-page lab report about 4 minutes — see measured speeds in the [Model Disclosure](docs/MODEL_DISCLOSURE.md#5-measured-performance).
- Small local models can be wrong; answers show sources and suggestions need confirmation. Errors seen on the test phone (a summary calling an unflagged result "elevated", a clinic name copied from records) are now flagged by deterministic checks, but not every possible error can be caught.
- Google sign-in needs OAuth configuration and uses the legacy Google Sign-In SDK.
- OpenMed clinical NER was investigated but not integrated ([why](docs/TECHNICAL_REQUIREMENTS.md#4-compatibility-decisions-and-trade-offs)).
- OCR: printed Latin script only; PDFs limited to 5 pages. No dark theme. Android only.

## Documentation

- [Product Requirements](docs/PRD.md)
- [Technical Requirements](docs/TECHNICAL_REQUIREMENTS.md)
- [App Flow](docs/APP_FLOW.md)
- [Design Brief](docs/DESIGN_BRIEF.md)
- [Database Schema](docs/DATABASE_SCHEMA.md)
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)
- [Local AI Architecture](docs/LOCAL_AI_ARCHITECTURE.md)
- [Privacy](docs/PRIVACY.md)
- [Model Disclosure](docs/MODEL_DISCLOSURE.md)
- [Developer Testing](docs/TESTING.md)
- [Panelist Testing Guide](docs/PANELIST_TESTING_GUIDE.md)

## Privacy
Everything stays on the device; the network is used only for optional Google sign-in, the one-time model download, maps/phone/email hand-offs you tap, and anonymous ML Kit usage metrics. See [Privacy](docs/PRIVACY.md).

## License
Third-party components keep their own licenses (Qwen3 weights: Apache-2.0; llama.cpp and llama.rn: MIT; Google ML Kit: ML Kit Terms of Service). The `LICENSE` file currently in this repository is the MIT license that came with the Expo project template (copyright 650 Industries); the project owner should confirm or replace it with the intended license for Doc Pawi's own code.
