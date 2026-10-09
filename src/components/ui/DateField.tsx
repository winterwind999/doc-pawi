import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  addDays,
  formatDate,
  formatTimeOfDay,
  isValidIsoDate,
  isValidTimeOfDay,
  localTimeOfDay,
  parseLocalDate,
  toLocalDate,
  todayLocal,
} from '@/lib/dates';
import { colors } from '@/theme/colors';

import { Icon, type IconName } from './Icon';

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text className="text-sm font-semibold text-ink">
      {label}
      {required ? <Text className="text-coral-600"> *</Text> : null}
    </Text>
  );
}

/** The tappable box that shows the chosen value and opens the system picker. */
function PickerBox({
  label,
  display,
  placeholder,
  icon,
  error,
  onOpen,
  onClear,
}: {
  label: string;
  display: string | null;
  placeholder: string;
  icon: IconName;
  error?: string | null;
  onOpen: () => void;
  onClear?: () => void;
}) {
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${display ?? 'not set'}`}
      accessibilityHint="Opens a picker"
      className={`min-h-[48px] flex-row items-center gap-3 rounded-xl border bg-surface px-3.5 active:bg-surface-sunken ${
        error ? 'border-coral-500' : 'border-line-strong'
      }`}
    >
      <Icon name={icon} size={20} color={colors.inkMuted} />
      <Text numberOfLines={1} className={`flex-1 text-base ${display ? 'text-ink' : 'text-ink-soft'}`}>
        {display ?? placeholder}
      </Text>
      {display && onClear ? (
        <Pressable onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
          <Icon name="close-circle" size={20} color={colors.inkSoft} />
        </Pressable>
      ) : (
        <Icon name="chevron-down" size={20} color={colors.inkSoft} />
      )}
    </Pressable>
  );
}

function HintOrError({ hint, error }: { hint?: string; error?: string | null }) {
  if (error) {
    return (
      <Text accessibilityLiveRegion="polite" className="text-sm text-coral-600">
        {error}
      </Text>
    );
  }
  return hint ? <Text className="text-xs leading-4 text-ink-muted">{hint}</Text> : null;
}

/**
 * Date field: shows the date as "Oct 4, 2026" and opens the system date picker (Material 3
 * dialog from @expo/ui) instead of a text input. Values are local `YYYY-MM-DD` strings ('' = none).
 * `minDate`/`maxDate` limit both the picker and the quick-pick chips.
 */
export function DateField({
  label,
  value,
  onChange,
  error,
  required,
  hint,
  quickPicks = 'past',
  minDate,
  maxDate,
  placeholder = 'Select a date',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  required?: boolean;
  hint?: string;
  quickPicks?: 'past' | 'future' | 'none';
  minDate?: string;
  maxDate?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const today = todayLocal();
  const inRange = (d: string) => (!minDate || d >= minDate) && (!maxDate || d <= maxDate);
  const picks = (
    quickPicks === 'past'
      ? [
          { label: 'Today', value: today },
          { label: 'Yesterday', value: addDays(today, -1) },
        ]
      : quickPicks === 'future'
        ? [
            { label: 'Today', value: today },
            { label: 'Tomorrow', value: addDays(today, 1) },
            { label: 'In 1 week', value: addDays(today, 7) },
          ]
        : []
  ).filter((p) => inRange(p.value));
  const selected = isValidIsoDate(value) ? value : null;
  // The picker opens on the chosen date, or on today clamped into the allowed range.
  const initial = selected ?? (maxDate && today > maxDate ? maxDate : minDate && today < minDate ? minDate : today);

  return (
    <View className="gap-1.5">
      <FieldLabel label={label} required={required} />
      <PickerBox
        label={label}
        display={selected ? formatDate(selected) : null}
        placeholder={placeholder}
        icon="calendar-month-outline"
        error={error}
        onOpen={() => setOpen(true)}
        onClear={required ? undefined : () => onChange('')}
      />
      {picks.length ? (
        <View className="flex-row flex-wrap gap-2">
          {picks.map((p) => (
            <Pressable
              key={p.label}
              onPress={() => onChange(p.value)}
              accessibilityRole="button"
              accessibilityLabel={`Set ${label} to ${p.label.toLowerCase()}`}
              className={`min-h-[36px] justify-center rounded-full px-3 ${
                selected === p.value ? 'bg-primary-100' : 'bg-surface-sunken active:bg-primary-100'
              }`}
            >
              <Text numberOfLines={1} className="text-xs font-semibold text-ink-muted">
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <HintOrError hint={hint} error={error} />
      {open ? (
        <DateTimePicker
          value={parseLocalDate(initial)}
          mode="date"
          presentation="dialog"
          minimumDate={minDate ? parseLocalDate(minDate) : undefined}
          maximumDate={maxDate ? parseLocalDate(maxDate) : undefined}
          accentColor={colors.primary600}
          onValueChange={(_, date) => {
            setOpen(false);
            onChange(toLocalDate(date));
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}

/** Time field: shows "8:00 AM" and opens the system time picker. Values are 24-hour `HH:MM`. */
export function TimeField({
  label,
  value,
  onChange,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = isValidTimeOfDay(value) ? value : null;
  const initial = new Date();
  const [h, m] = (selected ?? '08:00').split(':').map(Number);
  initial.setHours(h, m, 0, 0);

  return (
    <View className="gap-1.5">
      <FieldLabel label={label} />
      <PickerBox
        label={label}
        display={selected ? formatTimeOfDay(selected) : null}
        placeholder="Select a time"
        icon="clock-outline"
        error={error}
        onOpen={() => setOpen(true)}
      />
      <HintOrError hint={hint} error={error} />
      {open ? (
        <DateTimePicker
          value={initial}
          mode="time"
          presentation="dialog"
          is24Hour={false}
          accentColor={colors.primary600}
          onValueChange={(_, date) => {
            setOpen(false);
            onChange(localTimeOfDay(date));
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}
