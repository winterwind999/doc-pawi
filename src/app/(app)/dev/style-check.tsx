import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

/**
 * NativeWind verification screen (Technical Requirements §NativeWind). Uses only raw React Native
 * primitives with `className`, so a correct render on an Android build proves the Babel/Metro/
 * Tailwind pipeline works natively (not just on the web).
 */
const SWATCHES = [
  { name: 'primary-500 (#589039)', className: 'bg-primary-500' },
  { name: 'primary-600', className: 'bg-primary-600' },
  { name: 'sand-300', className: 'bg-sand-300' },
  { name: 'ocean-400', className: 'bg-ocean-400' },
  { name: 'coral-400', className: 'bg-coral-400' },
  { name: 'olive-300', className: 'bg-olive-300' },
];

export default function StyleCheckScreen() {
  const [count, setCount] = useState(0);
  return (
    <ScrollView className="flex-1 bg-surface-muted" contentContainerClassName="gap-4 p-4 pb-12">
      <Stack.Screen options={{ title: 'Style check' }} />
      <View className="gap-1 rounded-2xl bg-primary-500 p-5">
        <Text className="text-2xl font-bold text-white">NativeWind on Android</Text>
        <Text className="text-base text-white">This card uses bg-primary-500, p-5, rounded-2xl, and text utilities.</Text>
      </View>
      <View className="gap-2 rounded-2xl border border-line bg-surface p-4">
        <Text className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Typography</Text>
        <Text className="text-3xl font-bold text-ink">text-3xl bold</Text>
        <Text className="text-xl font-semibold text-ink">text-xl semibold</Text>
        <Text className="text-base text-ink">text-base regular body text</Text>
        <Text className="text-sm italic text-ink-muted">text-sm italic muted</Text>
      </View>
      <Pressable
        onPress={() => setCount((c) => c + 1)}
        accessibilityRole="button"
        accessibilityLabel="Increment counter"
        className="min-h-[56px] items-center justify-center rounded-xl bg-primary-600 px-6 py-3 active:bg-primary-800"
      >
        <Text className="text-lg font-semibold text-white">Pressable · tapped {count}×</Text>
      </Pressable>
      <View className="flex-row flex-wrap gap-2">
        {SWATCHES.map((s) => (
          <View key={s.name} className="w-[48%] gap-1 rounded-xl border border-line bg-surface p-2">
            <View className={`h-12 rounded-lg ${s.className}`} />
            <Text className="text-xs text-ink">{s.name}</Text>
          </View>
        ))}
      </View>
      {Array.from({ length: 12 }, (_, i) => (
        <View key={i} className="flex-row items-center justify-between rounded-xl bg-surface px-4 py-3">
          <Text className="text-base text-ink">Scroll row {i + 1}</Text>
          <View className="h-3 w-3 rounded-full bg-primary-500" />
        </View>
      ))}
    </ScrollView>
  );
}
