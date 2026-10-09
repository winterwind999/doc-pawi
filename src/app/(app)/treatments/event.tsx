import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChoiceChips } from '@/components/ui/Choice';
import { DateField } from '@/components/ui/DateField';
import { Screen } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { todayLocal } from '@/lib/dates';
import { EVENT_STATUSES, EVENT_TYPES, type EventStatus, type EventType } from '@/lib/db/models';
import { getEvent, insertEvent, updateEvent } from '@/lib/db/repositories/treatments';
import { EVENT_STATUS_LABELS, EVENT_TYPE_LABELS } from '@/lib/labels';
import { fieldErrors, treatmentEventInputSchema } from '@/lib/validation/schemas';
import { useUnlockedSession } from '@/stores/session-store';

export default function TreatmentEventScreen() {
  const { treatmentId, eventId } = useLocalSearchParams<{ treatmentId: string; eventId?: string }>();
  const { db, profileId } = useUnlockedSession();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EventType | null>('dose');
  const [status, setStatus] = useState<EventStatus | null>('completed');
  const [scheduled, setScheduled] = useState('');
  const [completed, setCompleted] = useState('');
  const [facility, setFacility] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    void getEvent(db, eventId).then((e) => {
      if (!e) return;
      setTitle(e.title);
      setType(e.event_type);
      setStatus(e.status);
      setScheduled(e.scheduled_date ?? '');
      setCompleted(e.completed_date ?? '');
      setFacility(e.facility ?? '');
      setNotes(e.notes ?? '');
    });
  }, [db, eventId]);

  const save = async () => {
    const parsed = treatmentEventInputSchema.safeParse({
      treatment_id: treatmentId,
      title,
      event_type: type,
      status,
      scheduled_date: scheduled,
      completed_date: status === 'completed' ? completed : '',
      facility,
      notes,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      if (eventId) await updateEvent(db, eventId, parsed.data);
      else await insertEvent(db, { profileId, input: parsed.data, sourceType: 'manual' });
      router.back();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['bottom']} footer={<Button label="Save event" icon="content-save-outline" loading={saving} onPress={() => void save()} />}>
      <Stack.Screen options={{ title: eventId ? 'Edit event' : 'Add event' }} />
      <TextField label="Event" value={title} onChangeText={setTitle} required error={errors.title} placeholder="e.g. Dose 3, Session 5, Follow-up visit" />
      <ChoiceChips label="Type" options={EVENT_TYPES.map((v) => ({ value: v, label: EVENT_TYPE_LABELS[v] }))} value={type} onChange={setType} error={errors.event_type} />
      <ChoiceChips label="Status" options={EVENT_STATUSES.map((v) => ({ value: v, label: EVENT_STATUS_LABELS[v] }))} value={status} onChange={setStatus} error={errors.status} />
      {status === 'completed' ? (
        <DateField label="Date completed" value={completed} onChange={setCompleted} error={errors.completed_date} maxDate={todayLocal()} />
      ) : null}
      <DateField
        label="Scheduled date"
        value={scheduled}
        onChange={setScheduled}
        error={errors.scheduled_date}
        quickPicks="future"
        required={status === 'scheduled'}
        minDate={status === 'scheduled' ? todayLocal() : undefined}
        hint={status === 'scheduled' ? 'Required for scheduled events.' : 'Optional.'}
      />
      <TextField label="Facility" value={facility} onChangeText={setFacility} error={errors.facility} />
      <TextField label="Notes" value={notes} onChangeText={setNotes} multiline error={errors.notes} />
      {failure ? <Banner tone="danger">{failure}</Banner> : null}
    </Screen>
  );
}
