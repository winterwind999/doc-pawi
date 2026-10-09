# Doc Pawi — Panelist Testing Guide

> **Audience:** hackathon panelists, judges, and testers. No source code knowledge is needed.
> Developers: see [TESTING.md](TESTING.md). Background: [README](../README.md) · [Local AI Architecture](LOCAL_AI_ARCHITECTURE.md) · [Privacy](PRIVACY.md) · [Model Disclosure](MODEL_DISCLOSURE.md)

## 1. What this guide verifies

That Doc Pawi (1) runs on Android, (2) executes real AI inference **on the phone**, (3) answers from the user's **local** health records, (4) processes a medical document locally (OCR + AI), (5) creates structured records **only after confirmation**, (6) remains useful **offline**, (7) protects data (PIN, encryption), and (8) discloses its models and limitations accurately.

**Order of work:** prepare everything while online (install, profile, model download, demo data), then switch on **airplane mode** for the evaluation.

## 2. Prerequisites

| Item | Requirement |
|---|---|
| Phone | Android, 64-bit ARM (arm64-v8a). Tested on: HONOR JDY-LX2, Android 16, MediaTek Helio G85, ~6 GB RAM. Phones with less memory may be unable to load the 1.7B model (use the 0.6B model). |
| Free storage | ≥ 1.6 GB for the default model (≥ 1.1 GB for the small model) plus ~200 MB for the app |
| App | The Doc Pawi APK (see §3) |
| Internet | Needed **once**: model download (1.28 GB; Wi-Fi recommended). Not needed for any test case in §5. |
| Google account | **Not required.** Use "Continue without an account" (local-only profile). Google sign-in only works in builds configured with an OAuth client. |
| Time | ~5 min setup + model download. On the test phone (Helio G85): opening Chats starts a 30–50 s background preparation of the AI; an answer then takes about 20–60 s; analysing the sample document takes about 4 minutes |

## 3. Installation and preparation

1. **Get the APK.** Use the release APK provided by the project team (`app-release.apk`, about 141 MB, arm64), or build it yourself (README → *Build from source*). No GitHub release has been published yet.
2. **Install.** Open the APK on the phone and allow "Install unknown apps" for your browser/file manager when Android asks. Or, with a computer: `adb install -r doc-pawi-<version>.apk`.
3. **Create a profile (online not required).** Open Doc Pawi → *Get started* → *Continue without an account* → choose a 4-digit PIN (obvious PINs such as 1234 are rejected) → name (any) → optionally sex, birth date, height/weight → read the privacy page, toggle **I understand** → *Create my secure vault*.
4. **Install the model (online).** On *On-device AI*, tap **Download 1.28 GB** for *Qwen3 1.7B (Q4_K_M)*. Wait for *Verifying checksum* and *Installed · verified*. Tap **Load model**, then **Run test prompt** — a sentence and its speed (tokens/s) appear. Tap **Continue to Home**.
5. **Load synthetic data.** Avatar (top right) → *Settings* → **Load synthetic demo data**. Items appear in Records, Meds, Doctors, HMO marked **Demo**.
6. **Confirm readiness.** Settings → *Manage AI model* shows the model as **Loaded** with runtime details (llama.cpp build, CPU library, context window, KV cache). Optional: on phones with 8 CPU cores, try **CPU threads → 6** under *Performance* (it was the fastest setting on the test phone; the default is 4) and **Run llama.cpp benchmark** to see this phone's speed.
7. **Go offline.** Enable **airplane mode** (and keep Wi-Fi off) for §5.

No real patient data is used anywhere in this guide; all names, facilities, and values are fictional.

## 4. Test data

### 4.1 Synthetic demo profile data (Settings → Load synthetic demo data)

Fixed historical dates; "scheduled" items are relative to the day you load the data (D).

| Area | Data |
|---|---|
| Vaccination | **Hepatitis B vaccine series** (ongoing) at Quezon City Health Center (fictional): dose 1 completed **2026-03-02**, dose 2 completed **2026-04-06**, dose 3 **scheduled D + 14 days** |
| Vaccination | **Influenza vaccine 2026**: annual flu shot completed **2026-05-15** |
| Treatment | **Physical therapy – left knee** (ongoing, since 2026-09-01, Dr. Jose Reyes (demo)): sessions 1–3 completed **2026-09-03, 2026-09-10, 2026-09-17**; sessions 4–5 scheduled **D + 3** and **D + 10** |
| Records | Annual physical examination (2026-01-20, BP 118/76) · **Lipid profile (2026-05-08): total cholesterol 5.6 mmol/L HIGH**, LDL 3.6 HIGH, HDL 1.1, triglycerides 1.9 HIGH · Type 2 diabetes mellitus (2026-05-10) · Shellfish allergy (2019-08-12) |
| Medications | **Metformin (demo) 500 mg tablet**, 08:00 and 20:00 daily (yesterday: 08:00 taken, 20:00 skipped) · **Vitamin D3 (demo) 1000 IU**, 09:00 daily · **Amoxicillin (demo)** archived |
| Doctors | Dr. Maria Santos (demo), Internal Medicine · Dr. Jose Reyes (demo), Physical Medicine and Rehabilitation |
| HMO | **Sample HMO Health Plan (demo)**, Gold 150 (fictional), member ID DEMO-0000-1234, valid until 2027-06-30; 2 saved facilities (user-reported) |
| Not recorded | **Tetanus vaccine** (used to test that missing data is not invented) |

### 4.2 Synthetic document

The fictional lab report is bundled in the app (*Import document → Try the synthetic sample report*) and also provided as [`docs/test-data/synthetic-lab-report.png`](test-data/synthetic-lab-report.png) and [`.pdf`](test-data/synthetic-lab-report.pdf). Key contents: *Bayanihan Diagnostic Laboratory (fictional)*; collected **2026-09-15**; Hemoglobin 14.1 g/dL (13.5–17.5); Hematocrit 42.0 %; **WBC count 11.8 ×10⁹/L (4.5–11.0) HIGH**; Platelets 250; **Fasting glucose 5.9 mmol/L HIGH**; **Total cholesterol 5.4 mmol/L HIGH**; Creatinine 88 µmol/L.

## 5. Core test cases

Record results in §6. Expected AI wording varies; judge the **facts**.

| ID | Steps | Expected result |
|---|---|---|
| **PA-001** Application startup | Launch Doc Pawi; enter your PIN; arrive at Home | Mascot, greeting with your name, today's date, data-driven message (e.g. doses due), six tabs (Home, Chats, Records, Meds, Doctors, HMO); no crash |
| **PA-002** Local model status | Avatar → Settings → *Manage AI model* | Shows *Qwen3 1.7B (Q4_K_M)*, *Installed · verified* / *Loaded*, source commit, SHA-256, llama.cpp build, CPU library, "GPU: No (CPU only)". A deleted or unverified model is never shown as ready. |
| **PA-003** Offline inference | Airplane mode on → *Run test prompt*; then Chats → New conversation → "What is a normal resting heart rate for adults?" | A real answer is generated; under it: "AI-generated on this phone by Qwen3 1.7B (Q4_K_M)" and "Read N prompt tokens at X tok/s · wrote M tokens at Y tok/s". No network is needed. The first answer after opening Chats can wait for the background preparation to finish. |
| **PA-004** Health-history retrieval | In a chat: "When did I get my second hepatitis B dose?"; then "When is my next hepatitis B dose?"; then "When was my last tetanus shot?" | Answers **2026-04-06**; next dose on **D + 14**; tetanus: says it is **not recorded** (no invented date). Tap "Used N local records" to see the records used. |
| **PA-005** Local document processing | Airplane mode on → Records → *Import document* → *Try the synthetic sample report* | Status goes *Reading text…* → *Analyzing with local AI…* (about 4 minutes on the test phone) → *Ready for review*. Shows an AI summary and fields such as WBC 11.8 (marked high), glucose 5.9, cholesterol 5.4, creatinine 88, and a document date (2026-09-15 collected or 2026-09-16 reported); values not found in the text are labelled **Verify**. If the AI summary calls a test abnormal that the report does not flag (seen on the test phone: "elevated creatinine"), a warning appears under the summary — correct it before saving. *Recognized text* shows the OCR output. |
| **PA-006** Confirmation before saving | Chat: "I had a dental check-up yesterday at Smile Dental Clinic." → inspect the **AI suggestion — not saved** card → **Reject** → open Records (nothing new) → send the statement again → **Confirm & save** | Rejecting creates nothing. Confirming creates one record (source: *AI suggestion (confirmed by you)*) with the stated details. A vaccine statement (e.g. "I had my flu shot today at the city health center.") becomes a vaccination event under Records → Vaccinations; if the suggestion contains a facility you did not mention, the card says so. Also: confirming the document review in PA-005 creates a *Lab result* record linked to the document. |
| **PA-007** Persistence across restarts | Swipe Doc Pawi away from recent apps; reopen; enter PIN; open Records (still offline) | The confirmed records are present with the same values. |
| **PA-008** Medication dose history | Meds → Today: tap **Taken** on one dose and **Skipped** on another → *History* | Two separate events, one *Taken* and one *Skipped*; Undo is available on Today. |
| **PA-009** Doctors and HMO | Doctors → *Dr. Maria Santos (demo)*; HMO → *Sample HMO Health Plan (demo)* | Details available offline; HMO links and facilities are labelled **user-reported / not verified**. |
| **PA-010** Network-independent access | Airplane mode on: browse Chats history, Records (vaccinations, treatments, documents), Meds, Doctors, HMO | Everything opens. Online-only actions (model download, Google sign-in, Open in Maps) explain that they need connectivity. |
| **PA-011** Native styling and usability | Visit all six tabs; open a form (Add record) and a detail screen; scroll; type in a field; Settings → *Style check* | Consistent NativeWind styling (green brand, rounded cards), readable text, keyboard does not hide the focused field, nothing clipped. |
| **PA-012** Privacy and AI disclosure | Settings → *Privacy* and *AI model disclosure* | States on-device processing, the exact model/runtime/licenses, the network exceptions (model download, optional Google sign-in, map hand-off, ML Kit metrics), and limitations. No claim of zero network use or clinical reliability. |

Optional checks: emergency wording ("I have chest pain") shows a red *Possible emergency* banner with *Call 911*; asking "Should I double my metformin dose?" adds a fixed note that Doc Pawi cannot advise dose changes; Settings → *Lock now* returns to the PIN screen; five wrong PINs trigger a 30-second pause.

## 6. Evaluation record

| Field | Value |
|---|---|
| Tester | |
| Date | |
| Device (model, Android version, RAM) | |
| App version / APK file | |
| Model used | Qwen3 1.7B Q4_K_M / Qwen3 0.6B Q8_0 |
| Test prompt speed (prompt tok/s, generation tok/s) | |

| Case | Pass / Fail | Notes |
|---|---|---|
| PA-001 | | |
| PA-002 | | |
| PA-003 | | |
| PA-004 | | |
| PA-005 | | |
| PA-006 | | |
| PA-007 | | |
| PA-008 | | |
| PA-009 | | |
| PA-010 | | |
| PA-011 | | |
| PA-012 | | |

### 6.1 Reference run by the developer (for comparison)

Release APK on the HONOR JDY-LX2 test phone, 2026-10-10, airplane mode on and Wi-Fi off. Details: [TESTING.md §4](TESTING.md#4-on-device-results).

| Case | Result | Notes |
|---|---|---|
| PA-001 | Pass | PIN unlock, Home with greeting, date, and data-driven message |
| PA-002 | Pass | llama.cpp b10256 via llama.rn 0.12.9, `rnllama_jni_v8_2_dotprod`, CPU only, q8_0 KV cache, load 11–14 s |
| PA-003 | Pass | Test prompt 40 tokens at 12.7 tok/s, 9 tokens at 5.5 tok/s; chat answers generated offline (the heart-rate question itself was not asked) |
| PA-004 | Partly run | Second hepatitis B dose answered correctly (2026-04-06, 2 sources). The next-dose and tetanus questions were not asked in this run |
| PA-005 | Pass, with one AI error caught | OCR 866 characters; all 7 values and 3 HIGH flags correct; summary said "elevated creatinine" — flagged by the app and corrected before saving |
| PA-006 | Pass | Flu-shot suggestion rejected (nothing saved), then a corrected one confirmed and saved |
| PA-007 | Pass | Data kept across force-stops and app reinstalls |
| PA-008 | Pass | Taken and Skipped recorded separately; Undo; History |
| PA-009 | Pass | Doctor and HMO details offline; accreditation labelled as not verified; maps hand-off asks first |
| PA-010 | Pass | All tabs and details opened offline; the model screen explains that downloads need internet |
| PA-011 | Pass | Style check, forms with validation messages, scrolling; welcome subtitle clipping found and fixed |
| PA-012 | Pass | Privacy, AI model disclosure, and medical disclaimer screens |

## 7. Known limitations (read before judging)

- AI answers and document analysis are slow on mid-range phones (see measured speeds in [MODEL_DISCLOSURE.md](MODEL_DISCLOSURE.md#5-measured-performance)).
- The small on-device model can make mistakes; that is why answers show their sources and suggestions require confirmation.
- Google sign-in is disabled in builds without an OAuth client; the local-only profile is the supported evaluation path.
- OCR reads printed Latin-script text only (no handwriting). PDFs: first 5 pages.
- Reminders may be delayed by a few minutes unless Android's "Alarms & reminders" access is granted (on the test phone a reminder arrived about 80 s after its time).
- Removing demo data keeps anything you added yourself, including doses you added to a demo vaccine series.
