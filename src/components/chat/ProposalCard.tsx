import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ZodError } from 'zod';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ChoiceChips } from '@/components/ui/Choice';
import { DateField } from '@/components/ui/DateField';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextField } from '@/components/ui/TextField';
import { useLiveQuery } from '@/hooks/use-live-query';
import { RECORD_CATEGORIES, TREATMENT_KINDS, type RecordProposalRow } from '@/lib/db/models';
import { listTreatments } from '@/lib/db/repositories/treatments';
import { CATEGORY_LABELS, TREATMENT_KIND_LABELS } from '@/lib/labels';
import {
  confirmProposal,
  readProposalPayload,
  rejectProposal,
  type EventProposalPayload,
  type ProposalPayload,
  type RecordProposalPayload,
} from '@/lib/services/proposal-service';
import { fieldErrors } from '@/lib/validation/schemas';
import { useUnlockedSession } from '@/stores/session-store';

const UNVERIFIED_NOTE: Record<string, string> = {
  event_date: 'Date was not given — add it if you know it.',
  date: 'Date was not given — add it if you know it.',
  facility: 'The facility was not in your message — the AI may have taken it from your records. Check it before saving.',
};

const facilityOf = (p: ProposalPayload) => (p.kind === 'medical_record' ? p.record.facility : p.event.facility);

function RecordFields({
  payload,
  onChange,
  errors,
}: {
  payload: RecordProposalPayload;
  onChange: (p: RecordProposalPayload) => void;
  errors: Record<string, string>;
}) {
  const r = payload.record;
  const set = (patch: Partial<RecordProposalPayload['record']>) => onChange({ ...payload, record: { ...r, ...patch } });
  return (
    <View className="gap-3">
      <ChoiceChips
        label="Category"
        options={RECORD_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }))}
        value={r.category}
        onChange={(v) => v && set({ category: v })}
        error={errors.category}
      />
      <TextField label="Title" value={r.title} onChangeText={(title) => set({ title })} error={errors.title} required />
      <DateField label="Date" value={r.event_date ?? ''} onChange={(v) => set({ event_date: v || null })} error={errors.event_date} />
      <TextField label="Clinic or facility" value={r.facility ?? ''} onChangeText={(v) => set({ facility: v || null })} error={errors.facility} />
      <TextField label="Summary" value={r.summary ?? ''} onChangeText={(v) => set({ summary: v || null })} multiline error={errors.summary} />
    </View>
  );
}

function EventFields({
  payload,
  onChange,
  errors,
}: {
  payload: EventProposalPayload;
  onChange: (p: EventProposalPayload) => void;
  errors: Record<string, string>;
}) {
  const treatments = useLiveQuery((db, profileId) => listTreatments(db, profileId), []);
  const t = payload.treatment;
  const e = payload.event;
  const setT = (patch: Partial<EventProposalPayload['treatment']>) => onChange({ ...payload, treatment: { ...t, ...patch } });
  const setE = (patch: Partial<EventProposalPayload['event']>) => onChange({ ...payload, event: { ...e, ...patch } });
  const matches = (treatments.data ?? []).filter((x) => x.kind === t.kind || x.title.toLowerCase() === t.title.toLowerCase());
  return (
    <View className="gap-3">
      <TextField
        label="Treatment or vaccine series"
        value={t.title}
        onChangeText={(title) => setT({ title, existing_treatment_id: null })}
        error={errors.title}
        required
      />
      {matches.length ? (
        <ChoiceChips
          label="Add to an existing treatment?"
          options={matches.map((m) => ({ value: m.id, label: m.title }))}
          value={t.existing_treatment_id}
          onChange={(id) => {
            const m = matches.find((x) => x.id === id);
            setT({ existing_treatment_id: id, ...(m ? { title: m.title, kind: m.kind } : {}) });
          }}
          allowDeselect
        />
      ) : null}
      <ChoiceChips
        label="Type"
        options={TREATMENT_KINDS.map((value) => ({ value, label: TREATMENT_KIND_LABELS[value] }))}
        value={t.kind}
        onChange={(v) => v && setT({ kind: v })}
      />
      <TextField label="Event" value={e.title} onChangeText={(title) => setE({ title })} error={errors.title} required />
      <ChoiceChips
        label="Status"
        options={[
          { value: 'completed', label: 'Completed' },
          { value: 'scheduled', label: 'Scheduled' },
        ]}
        value={e.status}
        onChange={(status) =>
          status &&
          setE({
            status,
            completed_date: status === 'completed' ? (e.completed_date ?? e.scheduled_date) : null,
            scheduled_date: status === 'scheduled' ? (e.scheduled_date ?? e.completed_date) : null,
          })
        }
      />
      {e.status === 'completed' ? (
        <DateField label="Date completed" value={e.completed_date ?? ''} onChange={(v) => setE({ completed_date: v || null })} error={errors.completed_date} />
      ) : (
        <DateField
          label="Scheduled date"
          value={e.scheduled_date ?? ''}
          onChange={(v) => setE({ scheduled_date: v || null })}
          error={errors.scheduled_date}
          quickPicks="future"
          required
        />
      )}
      <TextField label="Facility" value={e.facility ?? ''} onChangeText={(v) => setE({ facility: v || null })} error={errors.facility} />
      <TextField label="Notes" value={e.notes ?? ''} onChangeText={(v) => setE({ notes: v || null })} multiline error={errors.notes} />
    </View>
  );
}

function Summary({ payload }: { payload: ProposalPayload }) {
  if (payload.kind === 'medical_record') {
    const r = payload.record;
    return (
      <View className="gap-1">
        <Text className="text-base font-semibold text-ink">{r.title}</Text>
        <Text className="text-sm text-ink-muted">
          {CATEGORY_LABELS[r.category]} · {r.event_date ?? 'date not given'}
          {r.facility ? ` · ${r.facility}` : ''}
        </Text>
        {r.summary ? <Text className="text-sm text-ink">{r.summary}</Text> : null}
      </View>
    );
  }
  const e = payload.event;
  return (
    <View className="gap-1">
      <Text className="text-base font-semibold text-ink">{e.title}</Text>
      <Text className="text-sm text-ink-muted">
        {payload.treatment.title} · {e.status === 'completed' ? `completed ${e.completed_date ?? '(date not given)'}` : `scheduled ${e.scheduled_date ?? '(date needed)'}`}
        {e.facility ? ` · ${e.facility}` : ''}
      </Text>
    </View>
  );
}

/**
 * An AI-proposed change. Nothing is saved until Confirm; the (optionally edited) values are
 * validated again with the same rules as manual entry.
 */
export function ProposalCard({ proposal }: { proposal: RecordProposalRow }) {
  const { db, profileId } = useUnlockedSession();
  const original = readProposalPayload(proposal);
  const [payload, setPayload] = useState<ProposalPayload | null>(original);
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'confirm' | 'reject' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  if (!payload || !original) {
    return <Banner tone="danger">This suggestion could not be read and was ignored.</Banner>;
  }

  if (proposal.status !== 'pending') {
    const confirmed = proposal.status === 'confirmed';
    return (
      <View className="gap-2 rounded-2xl border border-line bg-surface p-3.5">
        <StatusBadge
          label={confirmed ? 'Saved after your confirmation' : 'Rejected — nothing saved'}
          tone={confirmed ? 'success' : 'neutral'}
          icon={confirmed ? 'check-decagram-outline' : 'close-circle-outline'}
        />
        <Summary payload={payload} />
        {confirmed && proposal.result_entity_id ? (
          <Button
            label="View in Records"
            size="sm"
            variant="ghost"
            icon="arrow-right"
            onPress={() =>
              proposal.result_entity_type === 'medical_record'
                ? router.push({ pathname: '/records/[id]', params: { id: proposal.result_entity_id! } })
                : router.push('/records')
            }
          />
        ) : null}
      </View>
    );
  }

  const confirm = async () => {
    setBusy('confirm');
    setErrors({});
    setFailure(null);
    try {
      await confirmProposal(db, { profileId, proposalId: proposal.id, editedPayload: payload });
    } catch (e) {
      if (e instanceof ZodError) {
        setErrors(fieldErrors(e));
        setEditing(true);
        setFailure('Please fix the highlighted fields before saving.');
      } else {
        setFailure((e as Error).message);
      }
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    setBusy('reject');
    try {
      await rejectProposal(db, proposal.id);
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="gap-3 rounded-2xl border-2 border-dashed border-sand-300 bg-sand-50 p-3.5">
      <View className="flex-row flex-wrap items-center gap-2">
        <StatusBadge label="AI suggestion — not saved" tone="pending" icon="creation-outline" />
        <Text className="text-xs text-ink-muted">Review before saving</Text>
      </View>
      {payload.warnings.map((w) => (
        <Banner key={w} tone="pending">
          {w}
        </Banner>
      ))}
      {payload.unverified_fields.map((f) =>
        // The facility note stays only while the facility is still the model's suggestion.
        UNVERIFIED_NOTE[f] && !(f === 'facility' && facilityOf(payload) !== facilityOf(original)) ? (
          <Text key={f} className="text-xs text-sand-700">
            {UNVERIFIED_NOTE[f]}
          </Text>
        ) : null,
      )}
      {editing ? (
        payload.kind === 'medical_record' ? (
          <RecordFields payload={payload} onChange={setPayload} errors={errors} />
        ) : (
          <EventFields payload={payload} onChange={setPayload} errors={errors} />
        )
      ) : (
        <Summary payload={payload} />
      )}
      {failure ? <Banner tone="danger">{failure}</Banner> : null}
      <View className="flex-row flex-wrap gap-2">
        <Button label="Confirm & save" icon="check" size="sm" loading={busy === 'confirm'} disabled={busy !== null} onPress={() => void confirm()} />
        <Button
          label={editing ? 'Done editing' : 'Edit'}
          icon="pencil-outline"
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onPress={() => setEditing((v) => !v)}
        />
        <Button label="Reject" icon="close" size="sm" variant="ghost" loading={busy === 'reject'} disabled={busy !== null} onPress={() => void reject()} />
      </View>
    </View>
  );
}
