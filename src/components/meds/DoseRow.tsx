import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatTimeOfDay } from '@/lib/dates';
import { deleteDoseEvent, recordDose, type DoseSlot } from '@/lib/db/repositories/medications';
import { useUnlockedSession } from '@/stores/session-store';

const STATE_BADGE = {
  taken: { label: 'Taken', tone: 'success', icon: 'check-circle-outline' },
  skipped: { label: 'Skipped', tone: 'neutral', icon: 'close-circle-outline' },
  due: { label: 'Due — not recorded', tone: 'pending', icon: 'clock-alert-outline' },
  upcoming: { label: 'Upcoming', tone: 'info', icon: 'clock-outline' },
} as const;

/**
 * One scheduled dose. Taken and Skipped create separate dose events; a notification never does.
 * Recording again replaces the status for that slot; Undo deletes the event.
 */
export function DoseRow({ slot }: { slot: DoseSlot }) {
  const { db, profileId } = useUnlockedSession();
  const [busy, setBusy] = useState<'taken' | 'skipped' | 'undo' | null>(null);
  const badge = STATE_BADGE[slot.state];
  const name = `${slot.medication.name}${slot.medication.strength ? ` ${slot.medication.strength}` : ''}`;

  const record = async (status: 'taken' | 'skipped') => {
    setBusy(status);
    try {
      await recordDose(db, {
        profileId,
        medicationId: slot.medication.id,
        scheduleId: slot.schedule.id,
        scheduledFor: slot.scheduledFor,
        status,
      });
    } finally {
      setBusy(null);
    }
  };

  const undo = async () => {
    if (!slot.event) return;
    setBusy('undo');
    try {
      await deleteDoseEvent(db, slot.event.id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="gap-3 rounded-2xl border border-line bg-surface p-3.5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-semibold text-ink">{name}</Text>
          <Text className="text-sm text-ink-muted">
            {formatTimeOfDay(slot.schedule.time_of_day)}
            {slot.schedule.dose_label ? ` · ${slot.schedule.dose_label}` : ''}
          </Text>
        </View>
        <StatusBadge label={badge.label} tone={badge.tone} icon={badge.icon} />
      </View>
      {slot.event ? (
        <View className="flex-row items-center justify-between">
          <Text className="text-xs text-ink-muted">
            Recorded {new Date(slot.event.event_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
          <Button label="Undo" size="sm" variant="ghost" icon="undo" loading={busy === 'undo'} onPress={() => void undo()} />
        </View>
      ) : (
        <View className="flex-row gap-2">
          <Button
            label="Taken"
            size="sm"
            icon="check"
            className="flex-1"
            loading={busy === 'taken'}
            disabled={busy !== null}
            onPress={() => void record('taken')}
            accessibilityHint={`Records ${name} at ${formatTimeOfDay(slot.schedule.time_of_day)} as taken`}
          />
          <Button
            label="Skipped"
            size="sm"
            variant="outline"
            icon="close"
            className="flex-1"
            loading={busy === 'skipped'}
            disabled={busy !== null}
            onPress={() => void record('skipped')}
            accessibilityHint={`Records ${name} at ${formatTimeOfDay(slot.schedule.time_of_day)} as skipped`}
          />
        </View>
      )}
    </View>
  );
}
