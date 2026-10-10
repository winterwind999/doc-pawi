import { InfoPage } from '@/components/InfoPage';

export default function PrivacyScreen() {
  return (
    <InfoPage
      title="Privacy"
      intro="Doc Pawi is designed so your health information never leaves your phone. This page lists exactly what is stored and the few cases where the network is used."
      sections={[
        {
          heading: 'Stored on this phone',
          body: [
            'Your profile, medical records, vaccinations, treatments, medications and dose history, doctors, HMO details, conversations, AI suggestions, and the text recognized from your documents are stored in an encrypted SQLCipher database (AES-256), one database per profile.',
            'The database key is a random 256-bit value stored with expo-secure-store, which encrypts it with an Android Keystore key. Your 4-digit PIN is not the encryption key; it unlocks access in the app and is stored only as a salted PBKDF2-SHA256 verifier.',
            'Imported documents are encrypted with AES-256-GCM using a non-exportable Android Keystore key unique to your profile. A decrypted copy is created only temporarily in the app cache while you view an image or while text is recognized, and is deleted afterwards.',
            'Android backup is disabled for Doc Pawi, so this data is not copied to cloud backups.',
          ],
        },
        {
          heading: 'Processed on this phone',
          body: [
            'AI answers and document analysis use a language model (Qwen3, via llama.cpp) running on this phone. Prompts, records, and documents are never sent to any AI service.',
            'Text recognition uses Google ML Kit’s on-device model. Images are processed on the phone and are not sent to Google.',
          ],
        },
        {
          heading: 'When the network is used',
          body: [
            'There are no accounts or sign-in: each profile exists only on this phone.',
            'AI model download: the model file is downloaded once from Hugging Face. The request contains no personal data.',
            'Maps and phone links: only when you tap “Open in Maps” or “Directions”, a call, or an email button, the address or map position, number, or email is handed to another app.',
            'Nearby facilities map: while you are online, map images are downloaded from OpenStreetMap (tile.openstreetmap.org). The requests reveal the map area on screen and your IP address, never your health data or which facilities you saved. Images already seen are kept in the app cache.',
            'Your location is read only when you tap “Use my location” or “Use my current location” (GPS works offline). Doc Pawi uses it on the phone to sort facilities by distance or to save a facility’s position, and never sends it anywhere. Android’s location service itself may be provided by Google.',
            '“Find from address” sends the address text you typed to the phone’s geocoding service (Google on most Android phones) to find its position. Doc Pawi asks first each time.',
            'Google ML Kit may send anonymous usage and performance metrics (for example, API latency and device model) to Google when the phone is online. It does not send your images or recognized text.',
            'Doc Pawi includes no analytics, advertising, or crash-reporting services.',
          ],
        },
        {
          heading: 'Deleting your data',
          body: [
            'Delete individual records, documents, medications, doctors, HMOs, or conversations from their screens.',
            'Settings → Delete all conversations removes every chat and pending suggestion.',
            'Settings → Delete health vault permanently removes this profile’s database, documents, reminders, and keys. The AI model file is separate and can be removed from Settings → Manage AI model.',
          ],
        },
        {
          heading: 'Limitations',
          body: [
            'Protection depends on your phone’s security. Use a device screen lock and keep Android updated.',
            'Someone who knows your PIN, or who can unlock your phone while Doc Pawi is unlocked, can see your data.',
            'PIN lockouts use the phone’s clock; changing the clock can shorten a lockout.',
            'Notifications you choose to show with medication names may appear on the lock screen.',
          ],
        },
      ]}
    />
  );
}
