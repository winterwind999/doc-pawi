import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChoiceChips } from '@/components/ui/Choice';
import { DateField } from '@/components/ui/DateField';
import { Screen } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { useLiveQuery } from '@/hooks/use-live-query';
import { todayLocal } from '@/lib/dates';
import { RECORD_CATEGORIES, type MedicalRecordRow, type RecordCategory } from '@/lib/db/models';
import { listDoctors } from '@/lib/db/repositories/doctors';
import { insertRecord, updateRecord } from '@/lib/db/repositories/records';
import { parseJson } from '@/lib/json';
import { CATEGORY_LABELS } from '@/lib/labels';
import { fieldErrors, recordInputSchema } from '@/lib/validation/schemas';
import { useUnlockedSession } from '@/stores/session-store';

export function RecordForm({ existing }: { existing?: MedicalRecordRow }) {
  const { db, profileId } = useUnlockedSession();
  const doctors = useLiveQuery((db, p) => listDoctors(db, p));
  const [category, setCategory] = useState<RecordCategory | null>(existing?.category ?? null);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [date, setDate] = useState(existing?.event_date ?? '');
  const [facility, setFacility] = useState(existing?.facility ?? '');
  const [summary, setSummary] = useState(existing?.summary ?? '');
  const [doctorId, setDoctorId] = useState<string | null>(existing?.doctor_id ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const save = async () => {
    const parsed = recordInputSchema.safeParse({
      category,
      title,
      event_date: date,
      facility,
      summary,
      doctor_id: doctorId,
      structured_data: existing ? parseJson<Record<string, unknown>>(existing.structured_data, {}) : {},
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        await updateRecord(db, existing.id, parsed.data);
        router.back();
      } else {
        const row = await insertRecord(db, { profileId, input: parsed.data, sourceType: 'manual' });
        router.replace({ pathname: '/records/[id]', params: { id: row.id } });
      }
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['bottom']} footer={<Button label={existing ? 'Save changes' : 'Save record'} icon="content-save-outline" loading={saving} onPress={() => void save()} />}>
      {existing && existing.source_type !== 'manual' ? (
        <Banner tone="info">Editing keeps this record’s original source ({existing.source_type === 'document' ? 'imported document' : existing.source_type === 'ai_chat' ? 'confirmed AI suggestion' : 'demo data'}).</Banner>
      ) : null}
      <ChoiceChips
        label="Category"
        options={RECORD_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }))}
        value={category}
        onChange={setCategory}
        error={errors.category}
      />
      <TextField label="Title" value={title} onChangeText={setTitle} required error={errors.title} placeholder="e.g. Annual check-up" maxLength={160} />
      <DateField label="Date" value={date} onChange={setDate} error={errors.event_date} hint="When it happened. Leave empty if unknown." maxDate={todayLocal()} />
      <TextField label="Clinic, hospital, or lab" value={facility} onChangeText={setFacility} error={errors.facility} />
      {doctors.data?.length ? (
        <ChoiceChips
          label="Doctor (optional)"
          options={doctors.data.map((d) => ({ value: d.id, label: d.name }))}
          value={doctorId}
          onChange={setDoctorId}
          allowDeselect
        />
      ) : null}
      <TextField label="Notes or summary" value={summary} onChangeText={setSummary} multiline error={errors.summary} maxLength={4000} />
      {failure ? <Banner tone="danger">{failure}</Banner> : null}
      <View />
    </Screen>
  );
}
