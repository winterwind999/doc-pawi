import { useState } from 'react';
import { Modal, Text, TextInput, View } from 'react-native';

import { colors } from '@/theme/colors';

import { Button } from './Button';
import { Icon } from './Icon';

/**
 * Confirmation dialog for consequential actions. Destructive variants can require the user to
 * type a word (e.g. DELETE) so irreversible deletions are never one tap away.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  requireText,
  busy = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  requireText?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const canConfirm = !requireText || typed.trim().toUpperCase() === requireText.toUpperCase();
  const close = () => {
    setTyped('');
    onCancel();
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-black/40 px-5">
        <View accessibilityViewIsModal className="w-full max-w-md gap-4 rounded-3xl bg-surface p-5">
          <View className="flex-row items-center gap-2">
            <Icon
              name={destructive ? 'alert-outline' : 'help-circle-outline'}
              size={24}
              color={destructive ? colors.coral600 : colors.primary700}
            />
            <Text accessibilityRole="header" className="flex-1 text-lg font-bold text-ink">
              {title}
            </Text>
          </View>
          <Text className="text-base leading-6 text-ink">{message}</Text>
          {requireText ? (
            <View className="gap-1.5">
              <Text className="text-sm text-ink-muted">Type {requireText} to confirm.</Text>
              <TextInput
                value={typed}
                onChangeText={setTyped}
                autoCapitalize="characters"
                autoCorrect={false}
                accessibilityLabel={`Type ${requireText} to confirm`}
                className="min-h-[48px] rounded-xl border border-line-strong px-3.5 text-base text-ink"
              />
            </View>
          ) : null}
          <View className="flex-row justify-end gap-2">
            <Button label={cancelLabel} variant="outline" onPress={close} disabled={busy} />
            <Button
              label={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              disabled={!canConfirm}
              loading={busy}
              onPress={() => {
                setTyped('');
                onConfirm();
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
