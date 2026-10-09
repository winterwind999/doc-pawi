import type { Tone } from '@/theme/colors';

import type {
  DocumentStatus,
  EventStatus,
  EventType,
  FacilityType,
  MedicationForm,
  RecordCategory,
  Sex,
  SourceType,
  TreatmentKind,
  TreatmentStatus,
} from './db/models';

/** User-facing labels for enum values. */
export const SEX_LABELS: Record<Sex, string> = {
  female: 'Female',
  male: 'Male',
  intersex: 'Intersex',
  prefer_not_to_say: 'Prefer not to say',
};

export const CATEGORY_LABELS: Record<RecordCategory, string> = {
  visit: 'Visit',
  diagnosis: 'Diagnosis',
  lab_result: 'Lab result',
  procedure: 'Procedure',
  allergy: 'Allergy',
  imaging: 'Imaging',
  prescription: 'Prescription',
  vaccination: 'Vaccination',
  note: 'Note',
  other: 'Other',
};

export const CATEGORY_ICONS: Record<RecordCategory, string> = {
  visit: 'stethoscope',
  diagnosis: 'clipboard-pulse-outline',
  lab_result: 'test-tube',
  procedure: 'hospital-box-outline',
  allergy: 'alert-decagram-outline',
  imaging: 'radiology-box-outline',
  prescription: 'prescription',
  vaccination: 'needle',
  note: 'note-text-outline',
  other: 'file-document-outline',
};

export const TREATMENT_KIND_LABELS: Record<TreatmentKind, string> = {
  vaccination: 'Vaccination',
  medication_course: 'Medication course',
  therapy: 'Therapy',
  procedure: 'Procedure series',
  monitoring: 'Monitoring',
  other: 'Other',
};

export const TREATMENT_STATUS_LABELS: Record<TreatmentStatus, string> = {
  planned: 'Planned',
  ongoing: 'Ongoing',
  completed: 'Completed',
  stopped: 'Stopped',
};

export const TREATMENT_STATUS_TONE: Record<TreatmentStatus, Tone> = {
  planned: 'pending',
  ongoing: 'info',
  completed: 'success',
  stopped: 'neutral',
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  dose: 'Dose',
  visit: 'Visit',
  test: 'Test',
  procedure: 'Procedure',
  session: 'Session',
  other: 'Other',
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  missed: 'Missed',
  cancelled: 'Cancelled',
};

export const EVENT_STATUS_TONE: Record<EventStatus, Tone> = {
  scheduled: 'pending',
  completed: 'success',
  missed: 'danger',
  cancelled: 'neutral',
};

export const MEDICATION_FORM_LABELS: Record<MedicationForm, string> = {
  tablet: 'Tablet',
  capsule: 'Capsule',
  liquid: 'Liquid',
  injection: 'Injection',
  inhaler: 'Inhaler',
  topical: 'Topical',
  drops: 'Drops',
  other: 'Other',
};

export const FACILITY_TYPE_LABELS: Record<FacilityType, string> = {
  hospital: 'Hospital',
  clinic: 'Clinic',
  laboratory: 'Laboratory',
  diagnostic_center: 'Diagnostic center',
  pharmacy: 'Pharmacy',
  other: 'Other',
};

export const SOURCE_LABELS: Record<SourceType, string> = {
  manual: 'Entered by you',
  document: 'From a document (confirmed)',
  ai_chat: 'AI suggestion (confirmed by you)',
  demo: 'Synthetic demo data',
};

export const SOURCE_TONE: Record<SourceType, Tone> = {
  manual: 'neutral',
  document: 'info',
  ai_chat: 'ai',
  demo: 'demo',
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  imported: 'Imported',
  extracting_text: 'Reading text…',
  text_extracted: 'Text extracted',
  analyzing: 'Analyzing with local AI…',
  ready_for_review: 'Ready for review',
  confirmed: 'Saved to records',
  rejected: 'Suggestion rejected',
  failed: 'Failed',
};

export const DOCUMENT_STATUS_TONE: Record<DocumentStatus, Tone> = {
  imported: 'neutral',
  extracting_text: 'info',
  text_extracted: 'info',
  analyzing: 'info',
  ready_for_review: 'pending',
  confirmed: 'success',
  rejected: 'neutral',
  failed: 'danger',
};

export function options<T extends string>(labels: Record<T, string>) {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}
