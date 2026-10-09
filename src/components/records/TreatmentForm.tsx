import { router } from 'expo-router';
import { useState } from 'react';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChoiceChips } from '@/components/ui/Choice';
import { DateField } from '@/components/ui/DateField';
import { Screen } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { useLiveQuery } from '@/hooks/use-live-query';
import { TREATMENT_KINDS, TREATMENT_STATUSES, type TreatmentKind, type TreatmentRow, type TreatmentStatus } from '@/lib/db/models';
import { listDoctors } from '@/lib/db/repositories/doctors';
import { insertTreatment, updateTreatment } from '@/lib/db/repositories/treatments';
import { TREATMENT_KIND_LABELS, TREATMENT_STATUS_LABELS } from '@/lib/labels';
import { fieldErrors, treatmentInputSchema } from '@/lib/validation/schemas';
import { useUnlockedSession } from '@/stores/session-store';

export function TreatmentForm({ existing, initialKind }: { existing?: TreatmentRow; initialKind?: TreatmentKind }) {
  const { db, profileId } = useUnlockedSession();
  const doctors = useLiveQuery((db, p) => listDoctors(db, p));
  const [title, setTitle] = useState(existing?.title ?? '');
  const [kind, setKind] = useState<TreatmentKind | null>(existing?.kind ?? initialKind ?? null);
  const [status, setStatus] = useState<TreatmentStatus | null>(existing?.status ?? 'ongoing');
  const [startDate, setStartDate] = useState(existing?.start_date ?? '');
  const [endDate, setEndDate] = useState(existing?.end_date ?? '');
  const [facility, setFacility] = useState(existing?.facility ?? '');
  const [doctorId, setDoctorId] = useState<string | null>(existing?.doctor_id ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsed = treatmentInputSchema.safeParse({
      title,
      kind,
      status,
      start_date: startDate,
      end_date: endDate,
      facility,
      doctor_id: doctorId,
      notes,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        await updateTreatment(db, existing.id, parsed.data);
        router.back();
      } else {
        const row = await insertTreatment(db, { profileId, input: parsed.data, sourceType: 'manual' });
        router.replace({ pathname: '/treatments/[id]', params: { id: row.id } });
      }
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['bottom']} footer={<Button label={existing ? 'Save changes' : 'Save'} icon="content-save-outline" loading={saving} onPress={() => void save()} />}>
      <TextField
        label={kind === 'vaccination' ? 'Vaccine or series' : 'Treatment name'}
        value={title}
        onChangeText={setTitle}
        required
        error={errors.title}
        placeholder={kind === 'vaccination' ? 'e.g. Hepatitis B vaccine series' : 'e.g. Physical therapy – left knee'}
      />
      <ChoiceChips label="Type" options={TREATMENT_KINDS.map((v) => ({ value: v, label: TREATMENT_KIND_LABELS[v] }))} value={kind} onChange={setKind} error={errors.kind} />
      <ChoiceChips label="Status" options={TREATMENT_STATUSES.map((v) => ({ value: v, label: TREATMENT_STATUS_LABELS[v] }))} value={status} onChange={setStatus} error={errors.status} />
      <DateField label="Start date" value={startDate} onChange={setStartDate} error={errors.start_date} />
      <DateField label="End date" value={endDate} onChange={setEndDate} error={errors.end_date} quickPicks="none" hint="Leave empty if ongoing." />
      <TextField label="Facility" value={facility} onChangeText={setFacility} error={errors.facility} />
      {doctors.data?.length ? (
        <ChoiceChips label="Doctor (optional)" options={doctors.data.map((d) => ({ value: d.id, label: d.name }))} value={doctorId} onChange={setDoctorId} allowDeselect />
      ) : null}
      <TextField label="Notes" value={notes} onChangeText={setNotes} multiline error={errors.notes} hint="Record the schedule your clinician gave you. Doc Pawi does not create treatment plans." />
      {failure ? <Banner tone="danger">{failure}</Banner> : null}
    </Screen>
  );
}
