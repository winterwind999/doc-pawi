import { Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { Screen } from './ui/Layout';

export interface InfoSection {
  heading: string;
  body: string[];
}

/** Static information page (privacy, model disclosure, disclaimer). */
export function InfoPage({ title, intro, sections }: { title: string; intro?: string; sections: InfoSection[] }) {
  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title }} />
      {intro ? <Text className="text-base leading-6 text-ink">{intro}</Text> : null}
      {sections.map((s) => (
        <View key={s.heading} className="gap-2 rounded-2xl border border-line bg-surface p-4">
          <Text accessibilityRole="header" className="text-base font-bold text-ink">
            {s.heading}
          </Text>
          {s.body.map((p, i) => (
            <Text key={i} selectable className="text-sm leading-5 text-ink">
              {p}
            </Text>
          ))}
        </View>
      ))}
    </Screen>
  );
}
