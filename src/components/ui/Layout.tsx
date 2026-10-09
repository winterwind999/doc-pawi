import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';

const mascot = require('@/assets/images/doc-pawi-mascot.png');

/**
 * Standard screen container: safe area, muted background, keyboard handling, and an optional
 * scroll view. Tab and stack screens with native headers pass `edges={['bottom']}` or `[]`.
 *
 * Android 15+ draws apps edge to edge, so the window no longer shrinks for the keyboard;
 * react-native-keyboard-controller scrolls the focused field into view and keeps the footer
 * (e.g. a Save button) on top of the keyboard.
 */
export function Screen({
  children,
  scroll = true,
  edges = [],
  className = '',
  contentClassName = '',
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  className?: string;
  contentClassName?: string;
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView edges={edges} className={`flex-1 bg-surface-muted ${className}`}>
      {scroll ? (
        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          bottomOffset={footer ? 96 : 24}
        >
          <View className={`gap-4 ${contentClassName}`}>{children}</View>
        </KeyboardAwareScrollView>
      ) : (
        <View className={`flex-1 ${contentClassName}`}>{children}</View>
      )}
      {footer ? <StickyFooter bottomEdge={edges.includes('bottom')}>{footer}</StickyFooter> : null}
    </SafeAreaView>
  );
}

/** Footer bar that rides on top of the keyboard while it is open. */
export function StickyFooter({ children, bottomEdge }: { children: ReactNode; bottomEdge: boolean }) {
  const insets = useSafeAreaInsets();
  // Above the bottom safe area the keyboard already covers that inset, so rise by the rest only.
  const covered = bottomEdge ? insets.bottom : 0;
  return (
    <KeyboardStickyView offset={{ closed: 0, opened: covered }}>
      <View className="gap-2 border-t border-line bg-surface p-4">{children}</View>
    </KeyboardStickyView>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  className = '',
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <View className={`flex-row items-center justify-between ${className}`}>
      <Text accessibilityRole="header" numberOfLines={1} className="shrink text-base font-bold uppercase tracking-wide text-ink-muted">
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={8}
          className="min-h-[44px] justify-center px-1"
        >
          <Text numberOfLines={1} className="text-sm font-semibold text-primary-700">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Mascot({ size = 96, className = '' }: { size?: number; className?: string }) {
  return (
    <Image
      source={mascot}
      accessibilityLabel="Doc Pawi, a sea turtle mascot wearing a doctor's coat"
      className={className}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

export function EmptyState({
  title,
  message,
  icon,
  showMascot = false,
  actionLabel,
  onAction,
  actionIcon,
}: {
  title: string;
  message?: string;
  icon?: IconName;
  showMascot?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: IconName;
}) {
  return (
    <View className="items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface px-5 py-8">
      {showMascot ? <Mascot size={88} /> : icon ? <Icon name={icon} size={36} color={colors.inkSoft} /> : null}
      <Text className="text-center text-lg font-semibold text-ink">{title}</Text>
      {message ? <Text className="text-center text-sm leading-5 text-ink-muted">{message}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} icon={actionIcon} onPress={onAction} variant="secondary" /> : null}
    </View>
  );
}

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <View accessibilityLiveRegion="polite" className="items-center justify-center gap-3 py-10">
      <ActivityIndicator color={colors.primary} />
      <Text className="text-sm text-ink-muted">{message}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View accessibilityRole="alert" className="items-center gap-3 rounded-2xl border border-coral-200 bg-coral-50 p-5">
      <Icon name="alert-circle-outline" size={28} color={colors.coral600} />
      <Text className="text-center text-sm leading-5 text-ink">{message}</Text>
      {onRetry ? <Button label="Try again" variant="outline" size="sm" onPress={onRetry} /> : null}
    </View>
  );
}

export function KeyValueRow({ label, value, emphasize = false }: { label: string; value: ReactNode; emphasize?: boolean }) {
  return (
    <View className="flex-row items-start justify-between gap-4 border-b border-line py-2.5">
      <Text className="w-2/5 text-sm text-ink-muted">{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text selectable className={`flex-1 text-right ${emphasize ? 'text-lg font-bold' : 'text-base'} text-ink`}>
          {value}
        </Text>
      ) : (
        <View className="flex-1 items-end">{value}</View>
      )}
    </View>
  );
}

export function ProgressBar({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'sand' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      className="h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken"
    >
      <View
        className={tone === 'primary' ? 'h-full rounded-full bg-primary-500' : 'h-full rounded-full bg-sand-500'}
        style={{ width: `${pct}%` }}
      />
    </View>
  );
}

export function ListItem({
  title,
  subtitle,
  icon,
  iconColor = colors.primary700,
  right,
  onPress,
  accessibilityHint,
  chevron = true,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconColor?: string;
  right?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
  chevron?: boolean;
}) {
  const content = (
    <>
      {icon ? (
        <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-50">
          <Icon name={icon} size={22} color={iconColor} />
        </View>
      ) : null}
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-semibold text-ink" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-sm text-ink-muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress && chevron ? <Icon name="chevron-right" size={22} color={colors.inkSoft} /> : null}
    </>
  );
  const base = 'min-h-[60px] flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3';
  if (!onPress) return <View className={base}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      className={`${base} active:bg-surface-muted`}
    >
      {content}
    </Pressable>
  );
}
