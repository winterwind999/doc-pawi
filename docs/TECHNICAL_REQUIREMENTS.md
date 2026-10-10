# Doc Pawi — Technical Requirements

> **Document role:** *how* Doc Pawi is built, with which technologies, and under which constraints.
> Related: [PRD](PRD.md) · [Local AI Architecture](LOCAL_AI_ARCHITECTURE.md) · [Database Schema](DATABASE_SCHEMA.md) · [Privacy](PRIVACY.md) · [Testing](TESTING.md)

## 1. Technology stack (as installed)

Only libraries that are actually integrated are listed. Versions are from `package.json` / `package-lock.json`.

| Area | Technology | Version | Role |
|---|---|---|---|
| App framework | Expo SDK | 57 (`expo ~57.0.27`) | Managed native toolchain with Continuous Native Generation (CNG) |
| Runtime | React Native / React | 0.86.3 / 19.2.3 | New Architecture (the only architecture since SDK 55), Hermes |
| Language | TypeScript | ~6.0.3 | `strict` mode |
| Navigation | Expo Router | ~57.0.25 | File-based routes in `src/app`, `Stack.Protected` guards, JS bottom tabs (`expo-router/js-tabs`) |
| Styling | NativeWind + Tailwind CSS | 4.2.7 + 3.4.x (`react-native-css-interop` 0.2.7) | `className` styling on native components |
| Compiler | React Compiler | via `experiments.reactCompiler` | Automatic memoization |
| Local LLM runtime | `llama.rn` | **0.12.9** (pinned; npm `latest` is an RC) | React Native JSI binding of llama.cpp |
| Inference engine | llama.cpp | build b10256 (commit `6c8dcaa`) | CPU inference, GGUF models, Jinja chat templates, grammar-constrained JSON, tool-call parsing |
| Default model | Qwen3 1.7B Q4_K_M (GGUF) | `ggml-org/Qwen3-1.7B-GGUF@daeb8e2d…` | Chat, tool proposals, document extraction ([MODEL_DISCLOSURE.md](MODEL_DISCLOSURE.md)) |
| Alternative model | Qwen3 0.6B Q8_0 (GGUF) | `ggml-org/Qwen3-0.6B-GGUF@b5f37287…` | Faster, lower-quality option for low-memory phones |
| OCR | Google ML Kit Text Recognition v2 (bundled Latin model) | `com.google.mlkit:text-recognition:16.0.1` | On-device text recognition, wrapped by the local native module |
| Native module | `modules/doc-pawi-native` (Kotlin, Expo Modules API) | local | OCR (images + PDF pages via `PdfRenderer`), AES-256-GCM vault with Android Keystore keys, streaming SHA-256, PBKDF2, device info |
| Database | `expo-sqlite` with **SQLCipher** | ~57.0.4 (`useSQLCipher: true`) | Encrypted per-profile SQLite database |
| Secrets | `expo-secure-store` | ~57.0.4 | Database keys, PIN verifiers, throttle state, profile registry (Android Keystore–encrypted) |
| Files | `expo-file-system` | ~57.0.7 | Model download (`File.createDownloadTask` with progress/pause/resume), vault paths |
| Reminders | `expo-notifications` | ~57.0.22 | Local DAILY notifications (no push service) |
| Import | `expo-document-picker`, `expo-image-picker`, `expo-asset` | 57.x | PDFs/images, camera, bundled synthetic sample |
| Biometrics | `expo-local-authentication` | ~57.0.3 | Optional unlock |
| Connectivity | `expo-network` | ~57.0.2 | Offline detection for online-only actions |
| Keyboard | `react-native-keyboard-controller` | 1.21.9 | Keeps the focused input and form footers above the keyboard on edge-to-edge Android (`KeyboardAwareScrollView`, `KeyboardStickyView`, `KeyboardAvoidingView` in chat) |
| Date and time pickers | `@expo/ui` | ~57.0.22 | Native Material picker dialogs (`DateTimePicker` from `@expo/ui/community/datetime-picker`) for every date and time field |
| Location | `expo-location` | ~57.0.20 | Foreground position on request (nearby facilities, a facility's position) and Android's geocoder for confirmed address lookups |
| Map | OpenStreetMap raster tiles, `expo-image` (~57.0.5), `react-native-gesture-handler` (~2.32.0), `react-native-reanimated` (4.5.1) | — | Small in-app tile map (`src/components/map/TileMap.tsx`): drag, pinch, zoom buttons, pins; no map SDK and no API key |
| Validation | Zod | ^4.6.5 | Form input, AI tool arguments, document extraction, proposal payloads |
| State | Zustand | ^5.0.15 | Session, model, onboarding, streaming stores |
| Icons | `@expo/vector-icons` (MaterialCommunityIcons) | ^15.0.2 | UI icons (bundled fonts, offline) |
| Build config | `expo-build-properties` | ~57.0.22 | `buildArchs: ["arm64-v8a"]` |
| Testing | Jest 29 + `jest-expo` 57 + `@react-native/jest-preset` 0.86.3; Node `node:sqlite` | — | Unit and database tests ([TESTING.md](TESTING.md)) |
| Lint | ESLint 9 + `eslint-config-expo` 57 (includes React Compiler rules) | — | `npx expo lint` |
| Package manager | npm (`package-lock.json`) | Node 24 | — |

Android SDK levels come from Expo SDK 57 defaults: **minSdk 24, compileSdk 36, targetSdk 36**, NDK 27.1, AGP 8.12, Gradle 9.3.1.

## 2. Architecture

```mermaid
flowchart TB
  subgraph UI["UI (Expo Router screens + NativeWind components)"]
    Onb[Onboarding / Unlock]
    Tabs[Home · Chats · Records · Meds · Doctors · HMO]
    Detail[Detail & form screens]
    ModelUI[Model setup / disclosure]
  end
  subgraph State["State (Zustand)"]
    Session[session-store]
    ModelStore[model-store]
    Stream[chat-stream-store]
  end
  subgraph Services["Services (src/lib/services, src/lib/ai)"]
    Chat[chat-service]
    Docs[document-service + jobs]
    Prop[proposal-service]
    Retr[retrieval router (read tools)]
    Tools[agent-tools (Zod-validated proposal tools)]
    Prompts[prompts / safety]
    Extract[extraction + grounding]
  end
  subgraph Data["Data (src/lib/db)"]
    Repos[repositories]
    DbWrap[createDb: write lock + transactions]
    SQLC[(SQLCipher DB per profile)]
  end
  subgraph Native["Native (Android)"]
    Llama[llama.rn → llama.cpp]
    DPN[doc-pawi-native: ML Kit OCR · AES-GCM vault · SHA-256 · PBKDF2]
    KS[Android Keystore]
    Notif[AlarmManager notifications]
    Loc[Location services / GPS]
  end
  subgraph Net["Network (explicit, optional)"]
    HF[Hugging Face model download]
    OSM[OpenStreetMap map tiles]
    Geo[Android geocoder: address lookup]
    Maps[Maps / phone / email hand-off]
  end
  UI --> State --> Services
  Chat --> Retr --> Repos
  Chat --> Prompts
  Chat --> Llama
  Chat --> Tools --> Prop --> Repos
  Docs --> DPN
  Docs --> Llama
  Docs --> Extract --> Prop
  Repos --> DbWrap --> SQLC
  Session --> KS
  DPN --> KS
  ModelStore --> Llama
  ModelStore -. once .-> HF
  Detail -. map screens, online .-> OSM
  Detail -. confirmed lookup .-> Geo
  Detail -. on request .-> Loc
  Detail -. user action .-> Maps
  Services --> Notif
```

**Layers.** Screens never run SQL directly; they call repositories/services through `useLiveQuery` (re-runs after every committed write) or explicit actions. Services orchestrate multi-step workflows. Repositories are plain functions over a small `DbExecutor` interface so the same code runs on SQLCipher (app) and `node:sqlite` (tests).

**Agent/tool execution.** The bounded agent has *read* tools executed deterministically before inference (retrieval router) and two *write-proposal* tools the model may call. Tool arguments are validated with Zod; valid calls become pending proposals; nothing is written to records until the user confirms. Details: [LOCAL_AI_ARCHITECTURE.md](LOCAL_AI_ARCHITECTURE.md).

**Encryption.** See [PRIVACY.md](PRIVACY.md) and [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#1-storage-layout).

**Online integrations.** Only the model download, OpenStreetMap map images on the map screens, address lookups the user confirms (Android geocoder), and user-initiated hand-offs (maps/phone/email). There are no accounts and no backend.

## 3. Technical constraints

| ID | Constraint | How it is met |
|---|---|---|
| TC-01 | Native inference requires a development or release build | `llama.rn`, SQLCipher, ML Kit, and the local Kotlin module are native; the app is built with `expo prebuild` + Gradle. Expo Go is **not** supported and is not used as evidence. |
| TC-02 | Dependencies verified against SDK 57 | Installed with `npx expo install`; `llama.rn` pinned to 0.12.9 after source review of its RN 0.86 compatibility; NativeWind 4.2.7 release notes list SDK 57 support. |
| TC-03 | No remote AI API | No AI SDK or HTTP inference client exists in the codebase. Inference runs only through `src/lib/ai/llama-engine.ts`. |
| TC-04 | No cloud sync of health records | No backend, no sync code, Android `allowBackup: false`. |
| TC-05 | No cloud OCR | ML Kit bundled on-device model only. |
| TC-06 | SQLCipher compatibility | `expo-sqlite` plugin option `useSQLCipher`; `PRAGMA key` is the first statement; `withExclusiveTransactionAsync` is avoided because it opens a second, unkeyed connection; `PRAGMA cipher_version` is shown in Settings. |
| TC-07 | Model output validated | Zod schemas for tool arguments, extraction JSON, and proposal payloads; grammar-constrained JSON for extraction; grounding check against OCR text; summary-vs-flags consistency check for document summaries; facility check against the user's message for chat suggestions. |
| TC-08 | Destructive changes confirmed | `ConfirmDialog` for every deletion; typing `DELETE` for vault, all-conversation, and permanent medication deletion. |
| TC-09 | Offline operation | All features except the model download, map images, address lookups, and hand-offs work offline; online-only buttons are disabled with an explanation when offline. The nearby facilities list, distances (GPS), and saved map pins work offline. |
| TC-10 | One inference at a time | `LlamaEngine` serializes operations; `model-store` rejects a second job with a clear message. |
| TC-11 | Logging hygiene | The app does not log prompts, OCR text, or records (no `console.log` of health data; no analytics SDKs). |

## 4. Compatibility decisions and trade-offs

| Topic | Attempt / finding | Decision | Trade-off |
|---|---|---|---|
| **NativeWind** | v4.2.7 is the npm `latest`; v5 is RC only. Function-valued `style` on `Pressable` is dropped by v4 (nativewind#1834). | Use v4.2.7 + Tailwind 3.4; never use style callbacks (use `active:` classes). | RN 0.86's dev LogBox renders imperfectly in development builds (dev only). |
| **Six tabs** | Expo Router native tabs are limited to 5 items on Android (Material). | JS tabs (`expo-router/js-tabs`). | JS tab bar instead of the platform BottomNavigationView. |
| **`llama.rn` version** | npm `latest` points to `0.13.0-rc.7`. Source review found no RN 0.86 Android blocker in 0.12.9. | Pin `llama.rn@0.12.9`; `n_gpu_layers: 0`; OpenCL/Hexagon disabled in the plugin. | No GPU/NPU acceleration (CPU only). |
| **Several tool calls per answer** | 0.12.9's `completion()` passes `parallel_tool_calls` to native code as the string `"true"` (`JSON.stringify`), but the native side reads booleans only, so each answer could hold one tool call: "my first shot … my 2nd …" gave one suggestion. | `llama-engine.ts` wraps llama.rn's `llamaGetFormattedChat` JSI function as it is installed on `global` (an accessor) and turns the string back into a boolean; chat requests set `parallel_tool_calls`. Answers keep at most two suggestions. | Depends on llama.rn's internal install order; if that changes, the wrapper is unused and answers fall back to one suggestion. Remove after a llama.rn fix. |
| **`llama.rn` install on Windows** | Its postinstall extracts native libraries with `tar`; GNU tar from Git Bash fails on Windows paths. | Run `npm install` from PowerShell/cmd (Windows `bsdtar`). | Documented in README. |
| **OCR wrappers** | `expo-text-extractor` uses the *unbundled* ML Kit model (downloads via Play services on first use → fails offline on a fresh install); `@react-native-ml-kit/text-recognition` is old-architecture only; neither handles PDFs. | Local Kotlin module with the **bundled** model and `PdfRenderer` page rendering, plus layout-aware row reconstruction for tables. | ~4 MB per ABI for the bundled model; Latin script only. |
| **Accounts** | Google sign-in needed an Android OAuth client (package + SHA-1) and used the deprecated legacy Google Sign-In SDK, and an account adds nothing to an offline, local-only app. | Removed: profiles are local-only; the schema keeps its `auth_provider` column for databases from early builds. | No account-based recovery: a forgotten PIN cannot be reset. |
| **Keyboard on Android 15+** | SDK 57 apps draw edge to edge, so the window no longer resizes for the keyboard; React Native's `KeyboardAvoidingView` (`height`) left the chat input behind the keyboard. | `react-native-keyboard-controller`: `KeyboardAwareScrollView` in `Screen` and onboarding, footers in `KeyboardStickyView`, and its `KeyboardAvoidingView` in chat with the header height (`useHeaderHeight`) as `keyboardVerticalOffset` (its `automaticOffset` measured the view at y = 0 on the test phone and left the composer hidden). Suggestions for a field are shown above it, where the keyboard and the sticky footer cannot cover them. | One more native module. |
| **Date entry** | Typed `YYYY-MM-DD` dates were error-prone and hard to read. | `@expo/ui`'s `DateTimePicker` (Material dialog) for all dates and times, with quick picks and min/max limits; dates displayed as "Oct 4, 2026", also inside AI text. | Dates are still stored as local `YYYY-MM-DD` strings. |
| **Relative dates in chat** | Qwen3 1.7B mis-computed weekdays: "last week Monday … on Thursday" (said on Sat, Oct 10, 2026) became Sep 27 and Oct 4, both Sundays. | `src/lib/ai/relative-dates.ts` resolves relative phrases in the app (weeks start Monday), the prompt lists them as "Dates mentioned", and suggestions with another date get a warning. The model also filed vaccine shots as visits, so a record suggestion whose title is a shot becomes a dose in a vaccination series. | English phrases only; other dates are still read by the model and checked by the user. |
| **Maps** | `react-native-maps` and `expo-maps` use Google Maps on Android (API key, requests to Google); a WebView map needs a bundled JavaScript library. | Own small map: OpenStreetMap raster tiles drawn with `expo-image` (disk cache) and `react-native-gesture-handler` + `react-native-reanimated` for drag and pinch. The OSM tile policy asks for a distinct User-Agent; the servers answered the first one, which contained "offline", with an "Access blocked" image for every tile (reproduced from the PC and the phone), so the app sends `DocPawi/1.0 (Android; com.docpawi.app)` and versions its tile cache key. | Fewer map features (whole zoom levels, no rotation or search); relies on OpenStreetMap's public tile servers under their fair-use policy, which may block without notice. |
| **Accreditation data** | No public, machine-readable directory of HMO-accredited facilities exists in the Philippines; each HMO publishes its own lists. | The map shows only facilities the user saved and linked to an HMO, labelled user-reported; nothing is looked up or guessed. | Users enter facilities and their positions themselves. |
| **SHA-256 of model files** | `expo-file-system` 57 offers only MD5; `expo-crypto` digests need the whole buffer in memory. | Streaming SHA-256 in Kotlin. | Native code to maintain. |
| **Windows native build** | (1) CMake staging paths under `node_modules/<lib>/android/.cxx` exceeded `MAX_PATH` → ninja "build.ninja still dirty after 100 tries"; (2) parallel `clang++` jobs exhausted 16 GB RAM; (3) the build needs roughly 10 GB of free disk space. | Config plugin `plugins/withShortCxxPaths.js` (Windows only): short CMake staging dir (`%LOCALAPPDATA%\dpcxx`, or `DOC_PAWI_CXX_ROOT` — which can point to another drive) and a CMake job pool (2 concurrent compiles, `DOC_PAWI_CXX_JOBS` to override). | Slower first native build on Windows (22 min 47 s measured for the first release build); no effect on macOS/Linux/EAS. |
| **Chat latency** | On the Helio G85, the ~700-token static prefix (system prompt + tool definitions) took ~45 s to read before every first answer; the first answer took 91 s. | Prefill the static prefix when Chats or a conversation opens and rely on llama.rn's longest-common-prefix KV reuse; the prefill is a one-token completion because with `n_predict: 0` llama.cpp leaves its timing counters open and bills the prefill to the next answer. Tool descriptions shortened. | ~30–50 s of background CPU whenever the cache is cold (after unlock, after a document analysis). Same question in a new chat: 47 s. |
| **KV cache type** | Generation slows with context depth on CPU: 5.5 tok/s at 128 tokens vs 2.7 tok/s at ~1,000 tokens (f16, llama.cpp benchmark). Streaming, sampling, and the tool grammar were measured to add no meaningful time. | `cache_type_k/v: 'q8_0'`; llama.cpp auto-enables flash attention, required for a quantized V cache. | Generation at depth 2.7 → 3.6 tok/s and ~200 MB less memory; prompt reading 15.8 → 13.3 tok/s. |
| **CPU threads** | On the Helio G85 (2 big + 6 little cores): benchmark generation 5.5 tok/s with 4 threads, 5.3 with 6, 1.7 with 8; in chat, 6 threads gave the best total time. | Keep llama.rn's default (up to 4) and offer 6/8 as a setting with a benchmark button. | Users must tune by hand; the right value is device-specific. |
| **llama.rn benchmark** | `bench()` skips every run while a previous stop's "interrupted" flag is set (it is only reset by the next completion), and its warm-up decode fails ("failed to initialize batch") when the KV cache still holds a prompt. | Before benchmarking: a one-token completion, then clear the KV cache; Stop only signals native code while something is running; an empty result is reported as an error. | One extra short completion per benchmark. |
| **Bundled sample in release builds** | In release APKs React Native embeds images as Android resources, and `expo-asset` reports a resource name instead of a file path, so the native vault failed with ENOENT. | The native module opens `android.resource://` URIs via `ContentResolver` and falls back to a drawable/raw resource lookup by name. | Native code to maintain. |
| **Exact alarms** | Android 14+ does not pre-grant `SCHEDULE_EXACT_ALARM`; expo-notifications silently falls back to inexact alarms. | Declare the permission; explain the limitation in Settings. | Reminders may be a few minutes late unless the user grants “Alarms & reminders”. |
| **Dark theme** | Not required for the core workflow. | `userInterfaceStyle: "light"`. | No dark mode in this version. |

## 5. Build and configuration summary

- `app.json` plugins: `expo-router`, `expo-splash-screen`, `llama.rn` (`enableOpenCLAndHexagon: false`), `expo-sqlite` (`useSQLCipher: true`), `expo-secure-store`, `expo-build-properties` (`buildArchs: ["arm64-v8a"]`), `expo-notifications` (icon, color), `expo-image-picker` (camera text, microphone disabled), `./plugins/withShortCxxPaths`.
- Android: package `com.docpawi.app`, `allowBackup: false`, extra permission `SCHEDULE_EXACT_ALARM`; `ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION` come from `expo-location`'s library manifest (foreground only, asked for at the moment of use; no background location).
- Environment: see [`.env.example`](../.env.example). No secrets are required to build.
