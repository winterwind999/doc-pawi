import {
  AUTH_PROVIDERS,
  DOCUMENT_MIME_TYPES,
  DOCUMENT_STATUSES,
  DOSE_STATUSES,
  EVENT_STATUSES,
  EVENT_TYPES,
  FACILITY_TYPES,
  HEIGHT_UNITS,
  MEDICATION_FORMS,
  MEDICATION_STATUSES,
  MESSAGE_ROLES,
  MESSAGE_STATUSES,
  PROPOSAL_STATUSES,
  PROPOSAL_TYPES,
  RECORD_CATEGORIES,
  SEX_VALUES,
  SOURCE_TYPES,
  TREATMENT_KINDS,
  TREATMENT_STATUSES,
  WEIGHT_UNITS,
} from './models';
import type { Db } from './types';

const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');
const isoDate = (column: string) =>
  `CHECK (${column} IS NULL OR ${column} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')`;

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Ordered, append-only list of schema migrations. Never edit a released migration;
 * add a new one instead. Documented in docs/DATABASE_SCHEMA.md.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
CREATE TABLE profiles (
  id TEXT PRIMARY KEY NOT NULL,
  auth_provider TEXT NOT NULL CHECK (auth_provider IN (${list(AUTH_PROVIDERS)})),
  auth_subject TEXT,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 80),
  email TEXT,
  sex TEXT CHECK (sex IS NULL OR sex IN (${list(SEX_VALUES)})),
  birth_date TEXT ${isoDate('birth_date')},
  height_value REAL CHECK (height_value IS NULL OR height_value > 0),
  height_unit TEXT CHECK (height_unit IS NULL OR height_unit IN (${list(HEIGHT_UNITS)})),
  weight_value REAL CHECK (weight_value IS NULL OR weight_value > 0),
  weight_unit TEXT CHECK (weight_unit IS NULL OR weight_unit IN (${list(WEIGHT_UNITS)})),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (auth_provider, auth_subject)
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_conversations_profile_updated ON conversations(profile_id, updated_at DESC);

CREATE TABLE medical_documents (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN (${list(DOCUMENT_MIME_TYPES)})),
  private_file_path TEXT NOT NULL UNIQUE,
  file_size INTEGER NOT NULL CHECK (file_size >= 0),
  sha256 TEXT NOT NULL,
  encryption TEXT NOT NULL DEFAULT 'aes-256-gcm',
  imported_at TEXT NOT NULL,
  processing_status TEXT NOT NULL CHECK (processing_status IN (${list(DOCUMENT_STATUSES)})),
  ocr_engine TEXT,
  page_count INTEGER,
  extracted_text TEXT,
  summary TEXT,
  error_message TEXT,
  source_type TEXT NOT NULL DEFAULT 'user' CHECK (source_type IN ('user', 'demo')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_documents_profile_imported ON medical_documents(profile_id, imported_at DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN (${list(MESSAGE_ROLES)})),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'complete' CHECK (status IN (${list(MESSAGE_STATUSES)})),
  attachment_document_id TEXT REFERENCES medical_documents(id) ON DELETE SET NULL,
  model_metadata TEXT CHECK (model_metadata IS NULL OR json_valid(model_metadata)),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at);

CREATE TABLE doctors (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  specialty TEXT,
  organization TEXT,
  address TEXT,
  phones TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(phones) AND json_type(phones) = 'array'),
  emails TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(emails) AND json_type(emails) = 'array'),
  photo_path TEXT,
  notes TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN (${list(SOURCE_TYPES)})),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_doctors_profile_name ON doctors(profile_id, name COLLATE NOCASE);

CREATE TABLE medical_records (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (${list(RECORD_CATEGORIES)})),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  event_date TEXT ${isoDate('event_date')},
  source_type TEXT NOT NULL CHECK (source_type IN (${list(SOURCE_TYPES)})),
  summary TEXT,
  structured_data TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(structured_data)),
  document_id TEXT REFERENCES medical_documents(id) ON DELETE SET NULL,
  doctor_id TEXT REFERENCES doctors(id) ON DELETE SET NULL,
  facility TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_records_profile_date ON medical_records(profile_id, event_date DESC);
CREATE INDEX idx_records_profile_category ON medical_records(profile_id, category);
CREATE INDEX idx_records_document ON medical_records(document_id);

CREATE TABLE treatments (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  kind TEXT NOT NULL CHECK (kind IN (${list(TREATMENT_KINDS)})),
  status TEXT NOT NULL CHECK (status IN (${list(TREATMENT_STATUSES)})),
  start_date TEXT ${isoDate('start_date')},
  end_date TEXT ${isoDate('end_date')},
  facility TEXT,
  doctor_id TEXT REFERENCES doctors(id) ON DELETE SET NULL,
  notes TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN (${list(SOURCE_TYPES)})),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_treatments_profile_status ON treatments(profile_id, status);

CREATE TABLE treatment_events (
  id TEXT PRIMARY KEY NOT NULL,
  treatment_id TEXT NOT NULL REFERENCES treatments(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  event_type TEXT NOT NULL CHECK (event_type IN (${list(EVENT_TYPES)})),
  status TEXT NOT NULL CHECK (status IN (${list(EVENT_STATUSES)})),
  scheduled_date TEXT ${isoDate('scheduled_date')},
  completed_date TEXT ${isoDate('completed_date')},
  facility TEXT,
  notes TEXT,
  medical_record_id TEXT REFERENCES medical_records(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN (${list(SOURCE_TYPES)})),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_events_treatment ON treatment_events(treatment_id);
CREATE INDEX idx_events_profile_dates ON treatment_events(profile_id, status, scheduled_date);

CREATE TABLE medications (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  strength TEXT,
  form TEXT CHECK (form IS NULL OR form IN (${list(MEDICATION_FORMS)})),
  instructions TEXT,
  prescriber_doctor_id TEXT REFERENCES doctors(id) ON DELETE SET NULL,
  start_date TEXT ${isoDate('start_date')},
  end_date TEXT ${isoDate('end_date')},
  status TEXT NOT NULL CHECK (status IN (${list(MEDICATION_STATUSES)})),
  archived_at TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN (${list(SOURCE_TYPES)})),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status = 'archived') = (archived_at IS NOT NULL))
);
CREATE INDEX idx_medications_profile_status ON medications(profile_id, status);

CREATE TABLE medication_schedules (
  id TEXT PRIMARY KEY NOT NULL,
  medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  time_of_day TEXT NOT NULL CHECK (time_of_day GLOB '[0-2][0-9]:[0-5][0-9]' AND time_of_day < '24:00'),
  dose_label TEXT,
  reminder_enabled INTEGER NOT NULL DEFAULT 1 CHECK (reminder_enabled IN (0, 1)),
  notification_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (medication_id, time_of_day)
);

CREATE TABLE dose_events (
  id TEXT PRIMARY KEY NOT NULL,
  medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  schedule_id TEXT REFERENCES medication_schedules(id) ON DELETE SET NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scheduled_for TEXT NOT NULL CHECK (scheduled_for GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]'),
  event_at TEXT NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (${list(DOSE_STATUSES)})),
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (medication_id, scheduled_for)
);
CREATE INDEX idx_dose_events_profile_scheduled ON dose_events(profile_id, scheduled_for DESC);

CREATE TABLE hmos (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL CHECK (length(trim(provider_name)) BETWEEN 1 AND 120),
  plan_name TEXT,
  member_id TEXT,
  valid_until TEXT ${isoDate('valid_until')},
  coverage_notes TEXT,
  hotline TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN (${list(SOURCE_TYPES)})),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE facilities (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  facility_type TEXT NOT NULL CHECK (facility_type IN (${list(FACILITY_TYPES)})),
  address TEXT,
  phone TEXT,
  notes TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN (${list(SOURCE_TYPES)})),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE hmo_facilities (
  hmo_id TEXT NOT NULL REFERENCES hmos(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  note TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (hmo_id, facility_id)
);

CREATE TABLE doctor_hmos (
  doctor_id TEXT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  hmo_id TEXT NOT NULL REFERENCES hmos(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (doctor_id, hmo_id)
);

CREATE TABLE record_proposals (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  origin TEXT NOT NULL CHECK (origin IN ('chat', 'document')),
  proposal_type TEXT NOT NULL CHECK (proposal_type IN (${list(PROPOSAL_TYPES)})),
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  document_id TEXT REFERENCES medical_documents(id) ON DELETE CASCADE,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  status TEXT NOT NULL CHECK (status IN (${list(PROPOSAL_STATUSES)})),
  result_entity_type TEXT,
  result_entity_id TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  CHECK ((status = 'pending') = (resolved_at IS NULL))
);
CREATE INDEX idx_proposals_message ON record_proposals(message_id);
CREATE INDEX idx_proposals_document ON record_proposals(document_id);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`,
  },
  {
    version: 2,
    name: 'message_attachments',
    // A message can carry several documents; v1's single attachment column is copied over.
    sql: `
CREATE TABLE message_attachments (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES medical_documents(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  PRIMARY KEY (message_id, document_id)
);
CREATE INDEX idx_message_attachments_document ON message_attachments(document_id);
INSERT INTO message_attachments (message_id, document_id, position)
  SELECT id, attachment_document_id, 0 FROM messages WHERE attachment_document_id IS NOT NULL;
`,
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Applies pending migrations. Each migration and its bookkeeping row commit atomically.
 * Throws if the database was created by a newer app version (downgrade protection).
 */
export async function migrate(db: Db, now: () => string = () => new Date().toISOString()) {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at TEXT NOT NULL);',
  );
  const row = await db.get<{ version: number | null }>(
    'SELECT MAX(version) AS version FROM schema_migrations',
  );
  const current = row?.version ?? 0;
  if (current > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `This health database uses schema v${current}, which is newer than this app supports (v${LATEST_SCHEMA_VERSION}). Update Doc Pawi.`,
    );
  }
  const applied: number[] = [];
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    await db.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        migration.version,
        migration.name,
        now(),
      ]);
    });
    applied.push(migration.version);
  }
  return { from: current, to: LATEST_SCHEMA_VERSION, applied };
}
