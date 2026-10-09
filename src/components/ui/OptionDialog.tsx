import { Modal, Pressable, Text, View } from 'react-native';

import { colors } from '@/theme/colors';

import { Button } from './Button';
import { Icon, type IconName } from './Icon';

export interface DialogOption {
  label: string;
  description?: string;
  icon: IconName;
  onPress: () => void;
}

/** A small modal that asks the user to pick one of a few actions (e.g. camera or gallery). */
export function OptionDialog({
  visible,
  title,
  message,
  options,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  options: DialogOption[];
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-black/40 px-5">
        <View accessibilityViewIsModal className="w-full max-w-md gap-3 rounded-3xl bg-surface p-5">
          <Text accessibilityRole="header" className="text-lg font-bold text-ink">
            {title}
          </Text>
          {message ? <Text className="text-base leading-6 text-ink-muted">{message}</Text> : null}
          {options.map((o) => (
            <Pressable
              key={o.label}
              onPress={o.onPress}
              accessibilityRole="button"
              accessibilityLabel={o.description ? `${o.label}. ${o.description}` : o.label}
              className="min-h-[56px] flex-row items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 active:bg-surface-sunken"
            >
              <View className="h-10 w-10 items-center justify-center rounded-full bg-primary-50">
                <Icon name={o.icon} size={22} color={colors.primary700} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold text-ink">{o.label}</Text>
                {o.description ? <Text className="text-sm text-ink-muted">{o.description}</Text> : null}
              </View>
            </Pressable>
          ))}
          <View className="flex-row justify-end">
            <Button label="Cancel" variant="outline" onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
