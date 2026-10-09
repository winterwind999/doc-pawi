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

Status legend: **Verified** = tested on the physical Android device · **Implemented** = complete, device verification pending · see [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) and [Testing](docs/TESTING.md).

| Feature | Status |
|---|---|
| Onboarding: local-only profile or Google sign-in, 4-digit PIN, profile (sex, DOB, height/weight with units), privacy disclosure, secure storage setup | Implemented (Google sign-in requires OAuth setup) |
| PIN unlock offline with persistent throttling, idle auto-lock, optional biometrics, sign-out | Implemented |
| Encrypted SQLCipher database per profile (Keystore-protected random key), AES-256-GCM document vault | Implemented |
| Home: date, greeting, mascot, data-driven message, today's doses, ongoing treatments, upcoming events, activity | Implemented |
| Chats: streaming local answers, stop, history, local-record retrieval with sources, AI proposals with confirm/edit/reject, emergency and dose-change safety notes, document attachments | Implemented |
| Documents: camera/gallery/PDF/sample import, on-device OCR, AI summary + field extraction with "Verify" labels, review and confirm | Implemented |
| Records, vaccinations, treatment timelines, provenance, search/filter, edit/delete | Implemented |
| Meds: schedules, Taken/Skipped history, archive, local reminders (generic lock-screen text) | Implemented |
| Doctors and HMO (user-reported links, facilities, map/call/email hand-off) | Implemented |
| Model setup: pinned download with progress/pause/resume, SHA-256 verification, load/unload, test prompt with timings, device info | Implemented |
| Synthetic demo data for evaluation | Implemented |
| Unit and database tests (57 passing) | Verified (Node) |

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
- AI is slow on mid-range phones (tens of seconds per answer; minutes per document) — see measured speeds in the [Model Disclosure](docs/MODEL_DISCLOSURE.md#5-measured-performance).
- Small local models can be wrong; answers show sources and suggestions need confirmation.
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
