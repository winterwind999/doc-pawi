import { Pressable, Text, View } from 'react-native';

import { colors } from '@/theme/colors';

import { Icon } from './Icon';

export function PinDots({ length, filled, error = false }: { length: number; filled: number; error?: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel={`${filled} of ${length} digits entered`}
      className="flex-row justify-center gap-4 py-2"
    >
      {Array.from({ length }, (_, i) => (
        <View
          key={i}
          className={`h-4 w-4 rounded-full border-2 ${
            error ? 'border-coral-500 bg-coral-500' : i < filled ? 'border-primary-600 bg-primary-600' : 'border-line-strong bg-transparent'
          }`}
        />
      ))}
    </View>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'extra', '0', 'back'] as const;

/** Large, accessible numeric keypad (no system keyboard, so the PIN never reaches IME suggestions). */
export function PinPad({
  onDigit,
  onBackspace,
  extraKey,
  disabled = false,
}: {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  extraKey?: { icon: 'fingerprint'; label: string; onPress: () => void } | null;
  disabled?: boolean;
}) {
  return (
    <View className={`w-full max-w-xs flex-row flex-wrap justify-between gap-y-3 self-center ${disabled ? 'opacity-40' : ''}`}>
      {KEYS.map((key) => {
        if (key === 'extra') {
          if (!extraKey) return <View key={key} className="h-16 w-20" />;
          return (
            <Pressable
              key={key}
              onPress={disabled ? undefined : extraKey.onPress}
              accessibilityRole="button"
              accessibilityLabel={extraKey.label}
              className="h-16 w-20 items-center justify-center rounded-2xl active:bg-surface-sunken"
            >
              <Icon name={extraKey.icon} size={30} color={colors.primary700} />
            </Pressable>
          );
        }
        if (key === 'back') {
          return (
            <Pressable
              key={key}
              onPress={disabled ? undefined : onBackspace}
              accessibilityRole="button"
              accessibilityLabel="Delete last digit"
              className="h-16 w-20 items-center justify-center rounded-2xl active:bg-surface-sunken"
            >
              <Icon name="backspace-outline" size={28} color={colors.ink} />
            </Pressable>
          );
        }
        return (
          <Pressable
            key={key}
            onPress={disabled ? undefined : () => onDigit(key)}
            accessibilityRole="button"
            accessibilityLabel={key}
            className="h-16 w-20 items-center justify-center rounded-2xl border border-line bg-surface active:bg-primary-50"
          >
            <Text className="text-2xl font-semibold text-ink">{key}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
