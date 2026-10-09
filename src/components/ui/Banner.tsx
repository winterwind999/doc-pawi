import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { toneClasses, type Tone } from '@/theme/colors';

import { Icon, type IconName } from './Icon';

const DEFAULT_ICON: Record<Tone, IconName> = {
  success: 'check-circle-outline',
  pending: 'clock-outline',
  danger: 'alert-octagon-outline',
  info: 'information-outline',
  neutral: 'information-outline',
  ai: 'creation-outline',
  demo: 'flask-outline',
};

export function Banner({
  tone = 'info',
  title,
  children,
  icon,
  action,
  className = '',
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  className?: string;
}) {
  const t = toneClasses[tone];
  return (
    <View
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      className={`flex-row gap-3 rounded-2xl border p-3.5 ${t.bg} ${t.border} ${className}`}
    >
      <View className="pt-0.5">
        <Icon name={icon ?? DEFAULT_ICON[tone]} size={20} color={t.icon} />
      </View>
      <View className="flex-1 gap-1">
        {title ? <Text className={`text-base font-semibold ${t.text}`}>{title}</Text> : null}
        {typeof children === 'string' ? <Text className="text-sm leading-5 text-ink">{children}</Text> : children}
        {action ? <View className="mt-1.5 flex-row flex-wrap gap-2">{action}</View> : null}
      </View>
    </View>
  );
}
