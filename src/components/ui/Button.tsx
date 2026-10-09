import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { colors } from '@/theme/colors';

import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, { box: string; text: string; icon: string; spinner: string }> = {
  // primary-600 behind white text keeps 5.3:1 contrast (the #589039 brand green is 3.8:1).
  primary: { box: 'bg-primary-600 active:bg-primary-700', text: 'text-white', icon: colors.white, spinner: colors.white },
  secondary: { box: 'bg-primary-50 active:bg-primary-100', text: 'text-primary-700', icon: colors.primary700, spinner: colors.primary700 },
  outline: { box: 'bg-surface border border-line-strong active:bg-surface-sunken', text: 'text-ink', icon: colors.ink, spinner: colors.ink },
  ghost: { box: 'bg-transparent active:bg-surface-sunken', text: 'text-primary-700', icon: colors.primary700, spinner: colors.primary700 },
  danger: { box: 'bg-coral-600 active:bg-coral-700', text: 'text-white', icon: colors.white, spinner: colors.white },
};

const SIZES: Record<Size, { box: string; text: string; icon: number }> = {
  sm: { box: 'min-h-[40px] px-3 rounded-xl', text: 'text-sm', icon: 18 },
  md: { box: 'min-h-[48px] px-4 rounded-xl', text: 'text-base', icon: 20 },
  lg: { box: 'min-h-[56px] px-5 rounded-2xl', text: 'text-lg', icon: 22 },
};

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  className?: string;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityHint,
  className = '',
  testID,
}: ButtonProps) {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={inactive ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      className={`flex-row items-center justify-center ${s.box} ${v.box} ${fullWidth ? 'self-stretch' : ''} ${
        inactive ? 'opacity-50' : ''
      } ${className}`}
    >
      <View className="max-w-full flex-row items-center justify-center gap-2">
        {loading ? (
          <ActivityIndicator size="small" color={v.spinner} />
        ) : icon ? (
          <Icon name={icon} size={s.icon} color={v.icon} />
        ) : null}
        {/* Single line: on some Android phones (seen on a Honor) a shrink-wrapped semibold label is
            measured a sub-pixel too narrow and its last word wraps out of view ("+ Add"). */}
        <Text numberOfLines={1} className={`shrink ${s.text} font-semibold ${v.text}`}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/** Compact icon-only button with an accessible label and a 44dp minimum touch target. */
export function IconButton({
  icon,
  label,
  onPress,
  color = colors.ink,
  className = '',
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  color?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={6}
      className={`h-11 w-11 items-center justify-center rounded-full active:bg-surface-sunken ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      <Icon name={icon} size={24} color={color} />
    </Pressable>
  );
}
