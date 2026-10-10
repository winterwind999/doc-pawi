# Doc Pawi — Product Requirements Document

> **Document role:** defines *what* Doc Pawi is, *why* it matters, *who* it serves, and *what is in scope*.
> Related: [Technical Requirements](TECHNICAL_REQUIREMENTS.md) · [App Flow](APP_FLOW.md) · [Implementation Plan](IMPLEMENTATION_PLAN.md) · [Panelist Testing Guide](PANELIST_TESTING_GUIDE.md)
>
> **Status legend** used throughout the documentation:
> **Verified** (implemented and tested on a physical Android device) · **Implemented** (code complete, not yet device-verified) · **Partial** (works with documented gaps) · **Planned** (not built yet) · **Unavailable** (deliberately not offered or blocked).
> Requirement status is tracked in the tables below and in the [Implementation Plan](IMPLEMENTATION_PLAN.md).

## 1. Product summary

**Doc Pawi — AI Medical Assistant** is an offline-first Android app that keeps a person's health information on their own phone and uses a **language model running on the device** to help them:

- ask questions about their own recorded health history (vaccinations, treatments, medications, lab results, doctors, HMO coverage);
- understand medical documents (photographed reports and PDFs) through **on-device OCR and on-device AI extraction**;
- turn conversations and documents into **structured records that the user reviews and confirms** before anything is saved;
- track medication schedules, dose history, vaccination series, and ongoing treatments, with local reminders.

### Local AI value proposition

| Concern | How Doc Pawi addresses it |
|---|---|
| Sensitive data leaving the device | Prompts, conversations, health records, and document contents are processed by a local LLM (llama.cpp via `llama.rn`) and local OCR. No cloud AI API is called. |
| Connectivity | After the one-time model download, the AI assistant, document processing, and all records work in airplane mode. |
| Trust in AI output | AI output is labelled as AI-generated, record changes are *proposals* that require explicit confirmation, and extracted values are checked against the source text. |
| Verifiability | The app shows the installed model file, its SHA-256 checksum, the llama.cpp build, and per-response timings (tokens/second) so evaluators can confirm inference is local. |

Doc Pawi provides health information and personal medical-record management. **It is not a substitute for licensed healthcare professionals**, does not diagnose, and does not prescribe.

## 2. Problem statement

1. **Scattered information.** Medical information is spread across paper results, phone photos, PDFs, prescriptions, and conversations with clinicians.
2. **Hard-to-remember history.** People struggle to recall vaccination dates and doses, treatment history, prescriptions, and upcoming appointments—especially across multi-dose treatments.
3. **Connectivity gaps.** Internet access may be unavailable exactly when a person needs their information (clinic waiting rooms, travel, rural areas, outages).
4. **Privacy risk of cloud AI.** Uploading lab results or prescriptions to cloud AI services exposes highly sensitive data to third parties.
5. **Need for help without replacing clinicians.** People want help organizing and understanding information, but the tool must not pretend to be a doctor.

## 3. Target users

| Persona | Needs | Relevant limitations of Doc Pawi |
|---|---|---|
| **Record keeper** — organizes personal medical history | One place for records, documents, and history; quick answers | Only knows what has been recorded or imported |
| **Patient in multi-step treatment** — e.g., a 3-dose vaccine series, physical therapy sessions | See what was done, what is next, and when | Does not create clinical schedules; the user enters or confirms them |
| **Lab-result recipient** | Understand a report in plain language; keep the values | OCR and a small LLM can misread values; the user must review |
| **Medication manager** | Today's doses, reminders, Taken/Skipped history | Reminders depend on Android notification permission and OS scheduling; never changes doses |
| **Offline user** | Access information without connectivity | The model download and map images need internet |
| **Privacy-conscious user** | Keep sensitive data on device | Data protection depends on device security (screen lock, OS updates) |

## 4. Product goals and success measures

| ID | Goal | Measure of success |
|---|---|---|
| G-1 | Generate responses with a locally running LLM | A chat reply is produced in airplane mode; the UI shows model name and tokens/s |
| G-2 | Retrieve locally stored history | Answers to "When was my second hepatitis B dose?" match the stored synthetic record; missing data is reported as not recorded |
| G-3 | Process a supported document offline | The synthetic lab report image is OCR'd and summarized in airplane mode; extracted fields are shown for review |
| G-4 | Create a user-confirmed record from conversation | A statement such as "I had my flu shot today at the city health center" produces a proposal that is saved only after Confirm |
| G-5 | Persist across restarts | Confirmed records are visible after force-closing and reopening the app (offline) |
| G-6 | Demonstrate the core workflow in airplane mode | Panelist test cases PA-003 to PA-010 pass with networking disabled |
| G-7 | Honest disclosure | Model, runtime, licenses, network exceptions, and limitations are shown in-app and in [MODEL_DISCLOSURE.md](MODEL_DISCLOSURE.md) / [PRIVACY.md](PRIVACY.md) |

## 5. Functional requirements

Each requirement has a stable ID. Acceptance criteria (AC) are written so they can be tested; the Panelist and developer test cases reference these IDs. The **Status** column reflects the current build (see [TESTING.md](TESTING.md) for evidence).

### 5.1 Authentication, onboarding, and local security

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-001 | ~~Google sign-in~~ — **removed** (2026-10-10). Doc Pawi has no accounts; every profile is local-only (FR-002). | — | Removed |
| FR-002 | **Local-only profile**: the only kind of profile; it exists only on this phone and needs no internet. | AC1: Welcome and the PIN step say the profile is local-only and that a forgotten PIN cannot be recovered. AC2: Onboarding goes straight to PIN creation (6 steps). | Verified |
| FR-003 | **Four-digit PIN** creation with confirmation. | AC1: Mismatched confirmation is rejected. AC2: The PIN is never stored in plain text. | Verified |
| FR-004 | **PIN unlock with throttling** for returning users, fully offline. | AC1: Correct PIN unlocks without network. AC2: After 5 consecutive failures, unlock is blocked with an increasing delay that survives app restarts. | Verified |
| FR-005 | **Idle auto-lock.** | AC1: Returning from background after the idle timeout requires the PIN. AC2: Locking closes the database and clears in-memory health data. | Verified |
| FR-006 | **Optional biometric unlock** (after PIN setup). | AC1: Can be enabled only after entering the PIN. AC2: PIN always remains available as a fallback. | Implemented — not verified on the device |
| FR-007 | **Profile setup:** display name, sex, date of birth, height and weight with units. | AC1: Invalid dates and implausible measurements are rejected with a descriptive message. AC2: Units are stored with values. AC3: The date of birth is chosen with a date picker limited to 1900 through today. | Verified |
| FR-008 | **Privacy and medical-limitations disclosure** acknowledged during onboarding. | AC1: The user must acknowledge before storage is initialized. | Verified |
| FR-009 | **Local storage initialization:** create a random database key in Android Keystore-backed storage and an encrypted SQLCipher database per profile. | AC1: The database file cannot be opened without the key. AC2: Failure shows a recoverable error. | Verified |
| FR-010 | **Profile view and edit.** | AC1: Changes persist after restart. | Implemented — not exercised on the device |
| FR-011 | **Sign out** ends the session without deleting data. | AC1: Sign-out closes the database and returns to the welcome screen. AC2: The profile can be unlocked again offline with its PIN. | Implemented — not exercised on the device |
| FR-012 | **Profile isolation.** Each local profile has its own encrypted database, key, PIN, and document-encryption key. | AC1: Unlocking profile A never exposes profile B's data. | Verified |

### 5.2 Home

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-013 | **Home dashboard** with local date, time-appropriate greeting, user name, mascot, contextual message, ongoing treatments, today's medication doses, upcoming treatment events, and an activity summary. | AC1: Every statement in the contextual message is derived from saved data (e.g., counts and dates); with no data, an onboarding-style empty state is shown. AC2: The mascot never implies a clinical assessment. | Verified |

### 5.3 AI conversations and agent

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-014 | **Conversations:** create, list, open, rename-by-first-message, and delete; messages persist. | AC1: Messages are visible after restart. AC2: Tapping a sent message shows when it was sent ("Sent Oct 10, 2026, 4:48 AM"). AC3: The message being typed stays visible above the keyboard. | Verified |
| FR-015 | **Local LLM responses** with streaming and cancellation. | AC1: Tokens appear progressively. AC2: *Stop* ends generation and keeps the partial text marked "Stopped". AC3: No network request is made for inference. | Verified (Stop: unit-tested only) |
| FR-016 | **Health-history retrieval** before answering user-specific questions. | AC1: Relevant local records are included in the model input. AC2: The UI shows which local records were used. | Verified |
| FR-017 | **No fabrication.** | AC1: When no matching record exists, the reply states that it is not recorded in Doc Pawi. | Implemented — unit-tested; the "not recorded" question was not asked on the device |
| FR-018 | **AI-proposed record changes** (medical record, treatment/vaccination event) validated with Zod and shown as a proposal card. | AC1: Nothing is written to Records until *Confirm*. AC2: *Reject* creates nothing. AC3: Invalid model output is reported and discarded. AC4: Relative dates in the user's message ("last week Monday", "yesterday") are worked out by the app and given to the model; a suggestion with a different date shows a "Check the date" warning. | Verified (the "Check the date" warning is unit-tested; on the phone the model used the given dates) |
| FR-019 | **Safety guidance**: emergency red-flag terms show an emergency banner (call 911 in the Philippines / local emergency number); the assistant never prescribes or changes doses. | AC1: The banner appears independently of the model output. | Verified |
| FR-020 | **Model state handling** in chat: not installed, loading, busy, error. | AC1: A missing model shows a link to model setup, not a fake answer. | Implemented — loading/ready verified; not-installed path not tested on the device |
| FR-042 | **Attach processed documents** to a question. | AC1: Up to three documents per message. AC2: The picker shows each document's processing state; documents whose text is not read yet cannot be attached. AC3: Attached documents are listed on the sent message; their text goes to the model, not into the message. | Verified (with two documents) |

### 5.4 Documents

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-021 | **Import** a photo (camera or gallery), an image file, or a text-based/scanned PDF (first pages), or the bundled synthetic sample. | AC1: Supported types are listed; unsupported types are rejected with a message. | Partial — bundled sample verified; camera, gallery, and PDF not tested on the device |
| FR-022 | **Encrypted storage** of imported files in app-private storage. | AC1: Stored files are AES-256-GCM encrypted with a per-profile Android Keystore key. | Verified |
| FR-023 | **Local OCR** text extraction. | AC1: Works in airplane mode. AC2: OCR failure produces a clear error and the document remains available. | Verified (image; PDF not tested on the device) |
| FR-024 | **Local AI summary and candidate fields** (document type, date, facility, clinician, lab values, medications, vaccinations). | AC1: Output is schema-validated. AC2: Values not found in the OCR text are flagged "Not found in document text — verify". | Verified |
| FR-025 | **Review, edit, reject, or confirm** the extraction. | AC1: Confirm creates a medical record linked to the document (provenance = document). AC2: Reject keeps the document but creates no record. | Verified |

### 5.5 Records, vaccinations, and treatments

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-026 | **Medical records:** list, search, filter by category, view details with provenance, add, edit, delete with confirmation. | AC1: Source is shown as Manual, Document, AI-assisted (confirmed), or Demo. AC2: Deleting a record never deletes its source document. | Verified (search/filter/edit unit-tested) |
| FR-027 | **Vaccination history** grouped by vaccine series with dose events. | AC1: Completed and scheduled doses are visually distinct. | Verified |
| FR-028 | **Treatment episodes and events timeline** (ongoing, completed, stopped; scheduled/completed/missed/cancelled events). | AC1: Marking an event completed records the completion date. | Verified (vaccination series; therapy timeline not viewed on the device) |

### 5.6 Medications

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-029 | **Medication definitions** with strength, form, instructions, prescriber, and daily schedule times. | AC1: Active and archived lists are separate. | Verified |
| FR-030 | **Dose events** recorded as Taken or Skipped, separately from medication definitions. | AC1: One event per scheduled dose; Taken and Skipped are never conflated. AC2: Undo is possible on the same day. | Verified |
| FR-031 | **Archive/remove medication** with confirmation; history is preserved on archive. | AC1: Archiving cancels reminders. | Verified (delete; archive unit-tested) |
| FR-032 | **Local reminders** via Android notifications. | AC1: Permission is requested with an explanation; denial is handled. AC2: A notification never marks a dose as taken. AC3: Notification text hides medication names unless the user opts in. | Verified |

### 5.7 Doctors and HMO

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-033 | **Doctors:** searchable list; add/edit/delete; specialty, organization, address, phones, emails, optional local photo, linked HMOs (user-reported). | AC1: HMO links are labelled "user-reported", never "verified". AC2: *Add photo* asks whether to take a photo or choose from the gallery. AC3: Specialty offers suggestions while typing. AC4: Up to five phone and five email fields. AC5: After *Save changes*, Back returns to where the user came from (no duplicate detail screen). | Verified (camera capture itself not tested) |
| FR-034 | **HMO:** provider, plan, member ID, validity, coverage notes, hotline; linked saved facilities and doctors. | AC1: Works offline. AC2: No accreditation data is invented. | Verified |
| FR-035 | **Optional map hand-off** ("Open in Maps" / "Directions") for a saved address or map position. | AC1: Clearly labelled as leaving the app and requiring connectivity; only the address, or the position and name, is shared. | Verified |
| FR-043 | **Nearby accredited facilities map.** | AC1: Shows only facilities the user linked to an HMO, labelled user-reported; nothing is looked up or guessed. AC2: With location permission, the list is sorted by straight-line distance from the user; without it the map and list still work. AC3: Map images come from OpenStreetMap with visible attribution; without internet, pins, list, and distances still work. AC4: Filters by HMO and facility type. | Verified (type filters with one HMO; pinch-zoom not tested) |
| FR-044 | **Facility location** for the map. | AC1: Can be set from the phone's position, an address lookup the user confirms (online), pasted coordinates, or a tap on the map preview. AC2: Stored only in the encrypted database; latitude and longitude are validated and saved together. | Verified |

### 5.8 Model lifecycle

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-036 | **Model download** to app-private storage with progress, cancel, free-space check, and SHA-256 verification against a pinned Hugging Face revision. | AC1: A corrupted or partial file is never marked ready. | Verified |
| FR-037 | **Model status and lifecycle:** load, unload, delete, test prompt with timings, device information. | AC1: The app never reports an absent or failed model as ready. | Verified (unload/delete not exercised on the device) |
| FR-045 | **Recommended model first.** | AC1: The AI model screen shows the model suggested for the phone's RAM first, with the reason, then the other model. AC2: Only quantized models are offered (Q4_K_M, Q8_0), and the screen says so. | Verified |

### 5.9 Settings, privacy, and data deletion

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| FR-038 | **Settings:** model status and storage, privacy information, model disclosure, medical disclaimer, PIN change, biometric toggle, notification preferences, idle-lock timeout. | AC1: Each item opens a working screen. | Verified (PIN change and biometric toggle not exercised on the device) |
| FR-039 | **Distinct destructive actions:** sign out, remove model, delete all conversations, delete health vault. | AC1: Each has its own confirmation explaining exactly what is removed. AC2: Deleting the vault removes the database, encrypted documents, and keys for that profile only. | Verified (delete vault, remove demo data); other actions not exercised on the device |
| FR-040 | **Offline behaviour.** | AC1: All local features work in airplane mode. AC2: Online-only actions (model download, map images, address lookup, map hand-off) explain why they are unavailable. | Verified (the address lookup's offline state was not checked on the phone) |
| FR-041 | **Synthetic demo data** loader for evaluation, clearly labelled, removable. | AC1: Demo rows are labelled "Demo" and can be removed without touching user-entered data. | Verified |
| FR-046 | **Date entry and display.** | AC1: Every date and time field opens the phone's picker instead of a text field, with sensible limits (no future dates for past events, end dates not before start dates). AC2: Dates are shown as "Oct 4, 2026" everywhere, including dates written by the AI. | Verified |

## 6. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-001 | Local inference | All LLM inference runs on-device through llama.cpp. There is no cloud inference fallback. |
| NFR-002 | Privacy | Health records, conversations, and document contents are never sent to any AI provider or analytics service. Network use is limited to the model download, OpenStreetMap map images, address lookups the user confirms, and user-initiated hand-offs; the user's location is read only on request and never sent (see [PRIVACY.md](PRIVACY.md)). |
| NFR-003 | Encryption | SQLCipher (AES-256) database with a random 256-bit key protected by Android Keystore; documents encrypted with AES-256-GCM using a non-exportable Keystore key. A 4-digit PIN is an access gate, not the encryption key. |
| NFR-004 | Offline reliability | Every local feature works without connectivity; errors explain what still works. |
| NFR-005 | Performance | UI stays responsive during model load and inference (native background threads). Conservative context (4,096 tokens) and output limits. Performance is measured on a physical device and reported honestly. |
| NFR-006 | Accessibility | Screen-reader labels on interactive elements, ≥ 44 dp touch targets, WCAG AA contrast for text, large readable medical values, descriptive errors. |
| NFR-007 | Maintainability | TypeScript strict mode, layered architecture (UI → services → repositories → database), shared NativeWind components, unit tests for core logic. |
| NFR-008 | Android compatibility | Android 7.0+ (per Expo SDK 57 minimum), arm64-v8a devices for local inference; verified on the device listed in [TESTING.md](TESTING.md). |
| NFR-009 | Data integrity | Foreign keys enforced; multi-step writes (confirming proposals, dose history, deletions) run in transactions; model output is validated with Zod before any write. |
| NFR-010 | Error handling | Model, OCR, database, permission, and network errors are surfaced with recovery actions; no silent failures. |
| NFR-011 | Resource constraints | Model download checks free space; model loading reports failures (e.g., insufficient memory); only one inference job runs at a time. |
| NFR-012 | Honest disclosure | The app and documentation state the model, runtime, licenses, measured performance, and limitations; unverified capabilities are not claimed. |
| NFR-013 | Logging hygiene | Health data, prompts, and OCR text are never written to logs. |
| NFR-014 | Input visibility | The focused input and the form's main action stay visible above the on-screen keyboard (Android 15+ edge-to-edge). |

## 7. Scope

### Must have
Genuine on-device inference · local health-context retrieval · local OCR + AI document processing for images and PDFs · confirmed record creation from chat and documents · encrypted local persistence · onboarding, unlock, Home, Chats, Records, Meds, Doctors, HMO, Settings, Model setup screens needed for the end-to-end demo.

### Should have
Medication reminders · treatment and vaccination timelines · model management UI · doctor and HMO management · robust settings · biometric unlock · synthetic demo data.

### Could have
More advanced retrieval (embeddings) · additional document formats · higher-accuracy OCR models · charts of lab values over time · offline map images · dark theme.

### Out of scope
Cloud-based medical reasoning · autonomous diagnosis · autonomous prescription or dose changes · invented HMO accreditation data · cloud sync or backup of health data · claims of clinical reliability · iOS release (code is cross-platform where practical, but only Android is built and tested).

## 8. User stories

| ID | Story | Acceptance criteria | Related |
|---|---|---|---|
| US-01 | As a user, I want to ask Doc Pawi about my recorded vaccination history while offline so I can review the information on my device. | Retrieves my actual records; the local model generates the answer; missing information is not fabricated; no cloud AI is used; the exchange remains in my conversation history. | FR-014–FR-017, FR-040 |
| US-02 | As a user, I want to photograph a lab report and get a plain-language summary and the key values, so that I can keep them without typing. | OCR + AI run locally; values not found in the text are flagged; I can edit before saving; the record links to the encrypted document. | FR-021–FR-025 |
| US-03 | As a user, I want to tell Doc Pawi "I got my second hepatitis B shot today" and have it suggest a record, so that logging is quick. | A proposal card shows the parsed fields; nothing is saved until I confirm; rejecting saves nothing. | FR-018, FR-027 |
| US-04 | As a user taking maintenance medication, I want to mark doses Taken or Skipped and see my history. | Each action creates one dose event; skipped and taken are distinct; history survives restarts. | FR-029–FR-031 |
| US-05 | As a user, I want reminders for my doses without exposing medication names on my lock screen. | Notifications fire locally; names are hidden by default; tapping opens Meds after unlock. | FR-032 |
| US-06 | As a returning user, I want to unlock my profile with my PIN without internet. | PIN unlock works offline; repeated failures are throttled. | FR-004 |
| US-07 | As a user, I want to keep my doctors' and HMO details handy offline. | Data is available offline; HMO links are labelled user-reported. | FR-033, FR-034 |
| US-08 | As a privacy-conscious user, I want to delete my health vault completely. | Database, documents, keys for my profile are removed; other profiles are unaffected; the model file is kept unless I remove it separately. | FR-039 |
| US-09 | As an evaluator, I want to confirm the model runs locally. | The model screen shows file, checksum, llama.cpp build, and timings; inference works in airplane mode. | FR-037, G-1 |

## 9. Medical safety principles

Doc Pawi must not present model output as a diagnosis, prescribe medication, change doses or override clinician instructions, invent health records, claim OCR is always accurate, or delay/dismiss emergency care. It communicates uncertainty, labels AI-generated content, and encourages appropriate professional care. See [LOCAL_AI_ARCHITECTURE.md](LOCAL_AI_ARCHITECTURE.md#6-safety-controls) for the controls that enforce this.
