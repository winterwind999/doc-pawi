/**
 * Row types for the encrypted per-profile database. Field names match column names
 * (snake_case) so rows can be used without a mapping layer. JSON columns are typed as
 * strings here; use the helpers in `json.ts` to parse them.
 */

export const SEX_VALUES = ['female', 'male', 'intersex', 'prefer_not_to_say'] as const;
export type Sex = (typeof SEX_VALUES)[number];

export const HEIGHT_UNITS = ['cm', 'in'] as const;
export type HeightUnit = (typeof HEIGHT_UNITS)[number];

export const WEIGHT_UNITS = ['kg', 'lb'] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export const AUTH_PROVIDERS = ['google', 'local'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

/** Where a piece of health data came from. Shown to the user as provenance. */
export const SOURCE_TYPES = ['manual', 'document', 'ai_chat', 'demo'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const RECORD_CATEGORIES = [
  'visit',
  'diagnosis',
  'lab_result',
  'procedure',
  'allergy',
  'imaging',
  'prescription',
  'vaccination',
  'note',
  'other',
] as const;
export type RecordCategory = (typeof RECORD_CATEGORIES)[number];

export const TREATMENT_KINDS = [
  'vaccination',
  'medication_course',
  'therapy',
  'procedure',
  'monitoring',
  'other',
] as const;
export type TreatmentKind = (typeof TREATMENT_KINDS)[number];

export const TREATMENT_STATUSES = ['planned', 'ongoing', 'completed', 'stopped'] as const;
export type TreatmentStatus = (typeof TREATMENT_STATUSES)[number];

export const EVENT_TYPES = ['dose', 'visit', 'test', 'procedure', 'session', 'other'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_STATUSES = ['scheduled', 'completed', 'missed', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const MEDICATION_FORMS = [
  'tablet',
  'capsule',
  'liquid',
  'injection',
  'inhaler',
  'topical',
  'drops',
  'other',
] as const;
export type MedicationForm = (typeof MEDICATION_FORMS)[number];

export const MEDICATION_STATUSES = ['active', 'archived'] as const;
export type MedicationStatus = (typeof MEDICATION_STATUSES)[number];

export const DOSE_STATUSES = ['taken', 'skipped'] as const;
export type DoseStatus = (typeof DOSE_STATUSES)[number];

export const FACILITY_TYPES = [
  'hospital',
  'clinic',
  'laboratory',
  'diagnostic_center',
  'pharmacy',
  'other',
] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];

export const DOCUMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;
export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];

export const DOCUMENT_STATUSES = [
  'imported',
  'extracting_text',
  'text_extracted',
  'analyzing',
  'ready_for_review',
  'confirmed',
  'rejected',
  'failed',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const MESSAGE_ROLES = ['user', 'assistant'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const MESSAGE_STATUSES = ['complete', 'generating', 'stopped', 'error'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const PROPOSAL_TYPES = ['medical_record', 'treatment_event'] as const;
export type ProposalType = (typeof PROPOSAL_TYPES)[number];

export const PROPOSAL_STATUSES = ['pending', 'confirmed', 'rejected'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export interface ProfileRow {
  id: string;
  auth_provider: AuthProvider;
  auth_subject: string | null;
  display_name: string;
  email: string | null;
  sex: Sex | null;
  birth_date: string | null;
  height_value: number | null;
  height_unit: HeightUnit | null;
  weight_value: number | null;
  weight_unit: WeightUnit | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationRow {
  id: string;
  profile_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  attachment_document_id: string | null;
  model_metadata: string | null;
  created_at: string;
}

export interface MedicalDocumentRow {
  id: string;
  profile_id: string;
  display_name: string;
  mime_type: DocumentMimeType;
  private_file_path: string;
  file_size: number;
  sha256: string;
  encryption: string;
  imported_at: string;
  processing_status: DocumentStatus;
  ocr_engine: string | null;
  page_count: number | null;
  extracted_text: string | null;
  summary: string | null;
  error_message: string | null;
  source_type: 'user' | 'demo';
  created_at: string;
  updated_at: string;
}

export interface MedicalRecordRow {
  id: string;
  profile_id: string;
  category: RecordCategory;
  title: string;
  event_date: string | null;
  source_type: SourceType;
  summary: string | null;
  structured_data: string;
  document_id: string | null;
  doctor_id: string | null;
  facility: string | null;
  created_at: string;
  updated_at: string;
}

export interface TreatmentRow {
  id: string;
  profile_id: string;
  title: string;
  kind: TreatmentKind;
  status: TreatmentStatus;
  start_date: string | null;
  end_date: string | null;
  facility: string | null;
  doctor_id: string | null;
  notes: string | null;
  source_type: SourceType;
  created_at: string;
  updated_at: string;
}

export interface TreatmentEventRow {
  id: string;
  treatment_id: string;
  profile_id: string;
  title: string;
  event_type: EventType;
  status: EventStatus;
  scheduled_date: string | null;
  completed_date: string | null;
  facility: string | null;
  notes: string | null;
  medical_record_id: string | null;
  source_type: SourceType;
  created_at: string;
  updated_at: string;
}

export interface MedicationRow {
  id: string;
  profile_id: string;
  name: string;
  strength: string | null;
  form: MedicationForm | null;
  instructions: string | null;
  prescriber_doctor_id: string | null;
  start_date: string | null;
  end_date: string | null;
  status: MedicationStatus;
  archived_at: string | null;
  source_type: SourceType;
  created_at: string;
  updated_at: string;
}

export interface MedicationScheduleRow {
  id: string;
  medication_id: string;
  time_of_day: string;
  dose_label: string | null;
  reminder_enabled: 0 | 1;
  notification_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DoseEventRow {
  id: string;
  medication_id: string;
  schedule_id: string | null;
  profile_id: string;
  /** Local wall-clock time of the planned dose, `YYYY-MM-DDTHH:MM`. */
  scheduled_for: string;
  /** UTC ISO timestamp of when the dose was taken or skipped. */
  event_at: string;
  /** IANA time zone in effect when the event was recorded. */
  timezone: string;
  status: DoseStatus;
  note: string | null;
  created_at: string;
}

export interface DoctorRow {
  id: string;
  profile_id: string;
  name: string;
  specialty: string | null;
  organization: string | null;
  address: string | null;
  phones: string;
  emails: string;
  photo_path: string | null;
  notes: string | null;
  source_type: SourceType;
  created_at: string;
  updated_at: string;
}

export interface HmoRow {
  id: string;
  profile_id: string;
  provider_name: string;
  plan_name: string | null;
  member_id: string | null;
  valid_until: string | null;
  coverage_notes: string | null;
  hotline: string | null;
  source_type: SourceType;
  created_at: string;
  updated_at: string;
}

export interface FacilityRow {
  id: string;
  profile_id: string;
  name: string;
  facility_type: FacilityType;
  address: string | null;
  phone: string | null;
  notes: string | null;
  source_type: SourceType;
  created_at: string;
  updated_at: string;
}

export interface RecordProposalRow {
  id: string;
  profile_id: string;
  origin: 'chat' | 'document';
  proposal_type: ProposalType;
  conversation_id: string | null;
  message_id: string | null;
  document_id: string | null;
  payload: string;
  status: ProposalStatus;
  result_entity_type: string | null;
  result_entity_id: string | null;
  created_at: string;
  resolved_at: string | null;
}
