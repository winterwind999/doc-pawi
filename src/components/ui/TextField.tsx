import { useState, type ReactNode } from 'react';
import { Text, TextInput, View, type KeyboardTypeOptions, type TextInputProps } from 'react-native';

import { colors } from '@/theme/colors';

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  autoCorrect?: boolean;
  maxLength?: number;
  editable?: boolean;
  className?: string;
  testID?: string;
  onSubmitEditing?: () => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  onFocus?: () => void;
  onBlur?: () => void;
  /**
   * Shown between the label and the input, e.g. suggestions. Content below the input would be
   * hidden behind the keyboard and the form's sticky footer while typing.
   */
  accessory?: ReactNode;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  error,
  required,
  multiline,
  keyboardType,
  autoCapitalize = 'sentences',
  autoComplete,
  autoCorrect,
  maxLength,
  editable = true,
  className = '',
  testID,
  onSubmitEditing,
  returnKeyType,
  onFocus,
  onBlur,
  accessory,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const border = error ? 'border-coral-500' : focused ? 'border-primary-500' : 'border-line-strong';
  return (
    <View className={`gap-1.5 ${className}`}>
      <Text className="text-sm font-semibold text-ink">
        {label}
        {required ? <Text className="text-coral-600"> *</Text> : null}
      </Text>
      {accessory}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSoft}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
        maxLength={maxLength}
        editable={editable}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        onSubmitEditing={onSubmitEditing}
        returnKeyType={returnKeyType}
        accessibilityLabel={label}
        accessibilityHint={hint}
        textAlignVertical={multiline ? 'top' : 'center'}
        className={`rounded-xl border bg-surface px-3.5 text-base text-ink ${border} ${
          multiline ? 'min-h-[96px] py-3' : 'min-h-[48px] py-2.5'
        } ${editable ? '' : 'bg-surface-sunken text-ink-muted'}`}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-coral-600">
          {error}
        </Text>
      ) : hint ? (
        <Text className="text-xs leading-4 text-ink-muted">{hint}</Text>
      ) : null}
    </View>
  );
}
