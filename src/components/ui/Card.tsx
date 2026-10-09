import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

export function Card({
  children,
  className = '',
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: {
  children: ReactNode;
  className?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const base = `rounded-2xl border border-line bg-surface p-4 ${className}`;
  if (!onPress) return <View className={base}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      className={`${base} active:bg-surface-muted`}
    >
      {children}
    </Pressable>
  );
}
