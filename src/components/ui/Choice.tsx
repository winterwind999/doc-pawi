import { Pressable, ScrollView, Text, View } from 'react-native';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

/** Single-select chips (wraps onto multiple lines). Exposed to screen readers as radio buttons. */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  allowDeselect = false,
}: {
  label?: string;
  options: readonly ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  error?: string | null;
  allowDeselect?: boolean;
}) {
  return (
    <View className="gap-1.5">
      {label ? <Text className="text-sm font-semibold text-ink">{label}</Text> : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row flex-wrap gap-2">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(selected && allowDeselect ? null : o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={o.label}
              className={`min-h-[44px] justify-center rounded-full border px-4 ${
                selected ? 'border-primary-600 bg-primary-600' : 'border-line-strong bg-surface active:bg-surface-sunken'
              }`}
            >
              <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-ink'}`}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text className="text-sm text-coral-600">{error}</Text> : null}
    </View>
  );
}

/** Horizontal segmented filter used at the top of list screens. */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pr-2">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            className={`min-h-[40px] justify-center rounded-full px-4 ${
              selected ? 'bg-ink' : 'border border-line bg-surface active:bg-surface-sunken'
            }`}
          >
            <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-ink'}`}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function ToggleRow({
  label,
  description,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : () => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      accessibilityHint={description}
      className={`min-h-[56px] flex-row items-center gap-3 py-2 ${disabled ? 'opacity-50' : ''}`}
    >
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-semibold text-ink">{label}</Text>
        {description ? <Text className="text-sm leading-5 text-ink-muted">{description}</Text> : null}
      </View>
      <View className={`h-7 w-12 justify-center rounded-full px-0.5 ${value ? 'bg-primary-600' : 'bg-line-strong'}`}>
        <View className={`h-6 w-6 rounded-full bg-white ${value ? 'self-end' : 'self-start'}`} />
      </View>
    </Pressable>
  );
}
