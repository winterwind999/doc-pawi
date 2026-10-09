import { Pressable, Text, View } from 'react-native';

import { addDays, todayLocal } from '@/lib/dates';

import { TextField } from './TextField';

/**
 * Date input as `YYYY-MM-DD` text with quick-pick chips. A typed field avoids a native date-picker
 * dependency and works with screen readers; validation happens in the Zod schemas.
 */
export function DateField({
  label,
  value,
  onChange,
  error,
  required,
  hint = 'Format: YYYY-MM-DD',
  quickPicks = 'past',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  required?: boolean;
  hint?: string;
  quickPicks?: 'past' | 'future' | 'none';
}) {
  const today = todayLocal();
  const picks =
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
        : [];
  return (
    <View className="gap-2">
      <TextField
        label={label}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9-]/g, '').slice(0, 10))}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
        hint={hint}
        error={error}
        required={required}
        maxLength={10}
      />
      {picks.length ? (
        <View className="flex-row flex-wrap gap-2">
          {picks.map((p) => (
            <Pressable
              key={p.label}
              onPress={() => onChange(p.value)}
              accessibilityRole="button"
              accessibilityLabel={`Set ${label} to ${p.label.toLowerCase()}`}
              className="min-h-[36px] justify-center rounded-full bg-surface-sunken px-3 active:bg-primary-100"
            >
              <Text className="text-xs font-semibold text-ink-muted">{p.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** 24-hour `HH:MM` time input. */
export function TimeField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}) {
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={(t) => {
        const digits = t.replace(/[^0-9]/g, '').slice(0, 4);
        onChange(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
      }}
      placeholder="08:00"
      keyboardType="number-pad"
      hint="24-hour time, e.g. 08:00 or 20:30"
      error={error}
      maxLength={5}
    />
  );
}
