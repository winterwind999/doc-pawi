import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button, IconButton } from '@/components/ui/Button';
import { ChoiceChips } from '@/components/ui/Choice';
import { DateField, TimeField } from '@/components/ui/DateField';
import { Screen, SectionHeader } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { useLiveQuery } from '@/hooks/use-live-query';
import { MEDICATION_FORMS, type MedicationForm as Form } from '@/lib/db/models';
import { listDoctors } from '@/lib/db/repositories/doctors';
import { createMedication, updateMedication, type MedicationWithSchedules } from '@/lib/db/repositories/medications';
import { MEDICATION_FORM_LABELS } from '@/lib/labels';
import { reconcileReminders } from '@/lib/notifications/reminders';
import { fieldErrors, medicationInputSchema } from '@/lib/validation/schemas';
import { useSession, useUnlockedSession } from '@/stores/session-store';
import { colors } from '@/theme/colors';

export function MedicationForm({ existing }: { existing?: MedicationWithSchedules }) {
  const { db, profileId } = useUnlockedSession();
  const settings = useSession((s) => s.settings);
  const doctors = useLiveQuery((db, p) => listDoctors(db, p));
  const [name, setName] = useState(existing?.name ?? '');
  const [strength, setStrength] = useState(existing?.strength ?? '');
  const [form, setForm] = useState<Form | null>(existing?.form ?? null);
  const [instructions, setInstructions] = useState(existing?.instructions ?? '');
  const [prescriber, setPrescriber] = useState<string | null>(existing?.prescriber_doctor_id ?? null);
  const [startDate, setStartDate] = useState(existing?.start_date ?? '');
  const [endDate, setEndDate] = useState(existing?.end_date ?? '');
  const [schedules, setSchedules] = useState(
    existing?.schedules.map((s) => ({ time_of_day: s.time_of_day, dose_label: s.dose_label ?? '' })) ?? [{ time_of_day: '08:00', dose_label: '' }],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsed = medicationInputSchema.safeParse({
      name,
      strength,
      form,
      instructions,
      prescriber_doctor_id: prescriber,
      start_date: startDate,
      end_date: endDate,
      schedules: schedules.filter((s) => s.time_of_day.trim()),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      const med = existing ? await updateMedication(db, existing.id, parsed.data) : await createMedication(db, { profileId, input: parsed.data, sourceType: 'manual' });
      await reconcileReminders(db, profileId, settings).catch(() => undefined);
      router.replace({ pathname: '/meds/[id]', params: { id: med.id } });
    } catch (e) {
      setFailure((e as Error).message.includes('UNIQUE') ? 'Each dose time must be different.' : (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['bottom']} footer={<Button label={existing ? 'Save changes' : 'Save medication'} icon="content-save-outline" loading={saving} onPress={() => void save()} />}>
      <Banner tone="info">Enter the medication exactly as prescribed. Doc Pawi never suggests or changes doses.</Banner>
      <TextField label="Medication name" value={name} onChangeText={setName} required error={errors.name} placeholder="e.g. Metformin" />
      <TextField label="Strength" value={strength} onChangeText={setStrength} error={errors.strength} placeholder="e.g. 500 mg" />
      <ChoiceChips label="Form" options={MEDICATION_FORMS.map((v) => ({ value: v, label: MEDICATION_FORM_LABELS[v] }))} value={form} onChange={setForm} allowDeselect />
      <TextField label="Instructions from your prescriber" value={instructions} onChangeText={setInstructions} multiline error={errors.instructions} />
      {doctors.data?.length ? (
        <ChoiceChips label="Prescribed by (optional)" options={doctors.data.map((d) => ({ value: d.id, label: d.name }))} value={prescriber} onChange={setPrescriber} allowDeselect />
      ) : null}
      <DateField label="Start date" value={startDate} onChange={setStartDate} error={errors.start_date} />
      <DateField label="End date" value={endDate} onChange={setEndDate} error={errors.end_date} quickPicks="none" hint="Leave empty if there is no planned end date." />

      <SectionHeader title="Daily dose times" actionLabel="Add time" onAction={() => setSchedules((s) => [...s, { time_of_day: '', dose_label: '' }])} />
      {errors.schedules ? <Text className="text-sm text-coral-600">{errors.schedules}</Text> : null}
      {schedules.map((s, i) => (
        <View key={i} className="flex-row items-start gap-2 rounded-2xl border border-line bg-surface p-3">
          <View className="flex-1 gap-2">
            <TimeField label={`Time ${i + 1}`} value={s.time_of_day} onChange={(v) => setSchedules((all) => all.map((x, j) => (j === i ? { ...x, time_of_day: v } : x)))} />
            <TextField label="Dose" value={s.dose_label} onChangeText={(v) => setSchedules((all) => all.map((x, j) => (j === i ? { ...x, dose_label: v } : x)))} placeholder="e.g. 1 tablet" />
          </View>
          <IconButton icon="trash-can-outline" label={`Remove time ${i + 1}`} color={colors.coral600} onPress={() => setSchedules((all) => all.filter((_, j) => j !== i))} />
        </View>
      ))}
      {schedules.length === 0 ? <Text className="text-sm text-ink-muted">No dose times: the medication is listed but has no reminders or daily schedule.</Text> : null}
      {failure ? <Banner tone="danger">{failure}</Banner> : null}
    </Screen>
  );
}
