import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { useSession } from '@/stores/session-store';
import { colors } from '@/theme/colors';

import { ConfirmDialog } from './ui/ConfirmDialog';
import { Icon, type IconName } from './ui/Icon';

function initials(name: string | undefined) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function AvatarMenu() {
  const profile = useSession((s) => s.profile);
  const [open, setOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const item = (icon: IconName, label: string, onPress: () => void, danger = false) => (
    <Pressable
      key={label}
      onPress={() => {
        setOpen(false);
        onPress();
      }}
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      className="min-h-[52px] flex-row items-center gap-3 rounded-xl px-3 active:bg-surface-sunken"
    >
      <Icon name={icon} size={22} color={danger ? colors.coral600 : colors.ink} />
      <Text className={`text-base font-semibold ${danger ? 'text-coral-600' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Account menu"
        accessibilityHint="Opens profile, settings, lock, and sign out"
        hitSlop={8}
        className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-primary-600 active:bg-primary-700"
      >
        <Text className="text-sm font-bold text-white">{initials(profile?.display_name)}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/30" onPress={() => setOpen(false)} accessibilityLabel="Close menu">
          <View accessibilityRole="menu" className="absolute right-3 top-14 w-64 gap-1 rounded-2xl border border-line bg-surface p-2">
            <View className="border-b border-line px-3 pb-2 pt-1">
              <Text className="text-base font-bold text-ink" numberOfLines={1}>
                {profile?.display_name}
              </Text>
              {profile?.email ? (
                <Text className="text-xs text-ink-muted" numberOfLines={1}>
                  {profile.email}
                </Text>
              ) : (
                <Text className="text-xs text-ink-muted">Local-only profile</Text>
              )}
            </View>
            {item('account-circle-outline', 'Profile', () => router.push('/profile'))}
            {item('cog-outline', 'Settings', () => router.push('/settings'))}
            {item('lock-outline', 'Lock now', () => void useSession.getState().lock())}
            {item('logout', 'Sign out', () => setConfirmSignOut(true), true)}
          </View>
        </Pressable>
      </Modal>
      <ConfirmDialog
        visible={confirmSignOut}
        title="Sign out?"
        message="Doc Pawi will close your encrypted health vault and return to the welcome screen. Your data stays encrypted on this phone, and you can unlock it again with your PIN (no internet needed). To erase data, use Settings → Delete health vault instead."
        confirmLabel="Sign out"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setConfirmSignOut(false);
          void useSession.getState().signOut();
        }}
      />
    </>
  );
}
