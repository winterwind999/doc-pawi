# Doc Pawi — Privacy

> **Document role:** what Doc Pawi stores, how it is protected, and exactly when the network is used.
> The same content is available in the app (Settings → Privacy). Related: [Database Schema](DATABASE_SCHEMA.md) · [Local AI Architecture](LOCAL_AI_ARCHITECTURE.md) · [Model Disclosure](MODEL_DISCLOSURE.md)

## 1. Summary

- Health records, documents, conversations, and AI processing stay **on the phone**.
- No cloud AI, no cloud OCR, no backend, no sync, no analytics or advertising SDKs, no crash reporting.
- The network is used only for: optional Google sign-in, the one-time model download, maps/phone/email hand-offs the user taps, and anonymous ML Kit usage metrics (see §4). Doc Pawi does **not** claim to make zero network requests.

## 2. Data stored locally

| Data | Storage | Protection |
|---|---|---|
| Profile (name, email, sex, date of birth, height, weight) | SQLCipher DB + SecureStore registry (name/email) | AES-256 (SQLCipher); Keystore-encrypted SecureStore |
| Records, vaccinations, treatments, medications, dose history, doctors, HMO details (incl. member ID), facilities | SQLCipher DB | AES-256 |
| Conversations and AI suggestions, model metadata | SQLCipher DB | AES-256 |
| Imported documents | `files/vault/<profile>/…` | AES-256-GCM, non-exportable Android Keystore key per profile |
| Recognized document text, AI summaries | SQLCipher DB | AES-256 |
| Database key (random 256-bit) | expo-secure-store | Encrypted by an Android Keystore AES-GCM key |
| PIN | Only a PBKDF2-SHA256 verifier (120,000 iterations, random salt) | SecureStore |
| Doctor photos | App-private files | Android app sandbox (not encrypted by Doc Pawi) |
| AI model files | App-private files | Public model weights; checksum-verified |

Android Auto Backup is disabled (`android:allowBackup="false"`), and SecureStore entries are excluded from backups.

## 3. How protection works

1. On profile creation, Doc Pawi generates a random 256-bit database key and stores it in SecureStore.
2. Unlocking with the PIN (or biometrics, if enabled) lets the app read that key and open the SQLCipher database. **The 4-digit PIN is an access gate, not the encryption key** — 10,000 combinations would be too weak as a key.
3. Failed PIN attempts are throttled (5 free attempts, then 30 s, 1, 5, 15, 30, 60 min), and the throttle state survives restarts.
4. Locking (manual, background timeout, or foreground inactivity) closes the database, stops generation, clears the model's KV cache, and removes decrypted preview files. The only prompt prepared ahead of time (when Chats opens) is the fixed instructions and tool definitions, which contain no personal data.
5. Each profile has its own database, key, PIN, and document key, so one profile cannot read another's data.
6. Deleting the health vault removes the database files, the vault folder, the Keystore document key (making any leftover ciphertext unrecoverable), all SecureStore entries, reminders, and the registry entry.

## 4. Network use

| When | Destination | What is sent | What is never sent |
|---|---|---|---|
| Google sign-in (optional, first setup only) | Google | Standard Google Sign-In request; Google returns name, email, account id | Health data |
| Model download (once per model) | huggingface.co and its CDN | HTTP request for a public file at a pinned commit | Any personal data |
| "Open in Maps", call, email buttons (user-initiated, confirmed for maps) | The phone's maps/phone/email app | The address, number, or email shown | Records, conversations |
| ML Kit text recognition (when online) | Google | Per Google's ML Kit terms: anonymous metrics about API usage and performance (e.g., latency, image size, device model, app package) | Images and recognized text ("processing … fully happens on-device") |

No prompt, conversation, record, document, or OCR text is sent to any AI provider.

## 5. Notifications

Medication reminders are local. By default their text is generic ("You have a scheduled medication dose") so medication names do not appear on the lock screen; the user can opt in to names. The channel uses private lock-screen visibility.

## 6. Deleting data

| Action | Removes | Keeps |
|---|---|---|
| Delete a record / document / medication / doctor / HMO | That item (documents: encrypted file + text) | Linked items (records keep data if their document is deleted) |
| Delete all conversations (type DELETE) | All chats and pending suggestions | Confirmed records |
| Remove AI model | The model file | All health data |
| Sign out | Nothing (closes the vault; Google session ended) | Everything, unlockable offline with the PIN |
| Delete health vault (type DELETE) | Entire profile: DB, documents, keys, reminders | Other profiles, model files |
| Android → Clear storage | Everything for all profiles | — |

## 7. Limitations

- Security depends on the phone: use a screen lock and keep Android updated. A rooted or compromised device can expose app data.
- Anyone who knows the PIN, or who uses the phone while Doc Pawi is unlocked, can read the data.
- Lockouts are based on the device clock; changing the clock can shorten them.
- Flash storage does not guarantee secure erasure; deleting the Keystore key is what makes deleted documents unrecoverable.
- Doctor photos are not encrypted by Doc Pawi (only protected by the app sandbox).
- Biometric unlock is an app-level gate that releases the same Keystore-protected key as the PIN.
- If medication names are enabled in notifications, they may appear on the lock screen.
