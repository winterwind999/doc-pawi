import { Text, View } from 'react-native';

import { toneClasses, type Tone } from '@/theme/colors';

import { Icon, type IconName } from './Icon';

export function StatusBadge({ label, tone = 'neutral', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const t = toneClasses[tone];
  return (
    <View
      accessible
      accessibilityLabel={label}
      className={`flex-row items-center gap-1 self-start rounded-full border px-2.5 py-1 ${t.bg} ${t.border}`}
    >
      {icon ? <Icon name={icon} size={14} color={t.icon} /> : null}
      <Text className={`text-xs font-semibold ${t.text}`}>{label}</Text>
    </View>
  );
}
