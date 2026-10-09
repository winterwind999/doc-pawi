import type { ReactNode } from 'react';
import { Text } from 'react-native';

interface TextProps {
  children: ReactNode;
  className?: string;
  numberOfLines?: number;
  selectable?: boolean;
}

export function Title({ children, className = '' }: TextProps) {
  return (
    <Text accessibilityRole="header" className={`text-2xl font-bold text-ink ${className}`}>
      {children}
    </Text>
  );
}

export function Heading({ children, className = '', numberOfLines }: TextProps) {
  return (
    <Text accessibilityRole="header" numberOfLines={numberOfLines} className={`text-lg font-semibold text-ink ${className}`}>
      {children}
    </Text>
  );
}

export function Body({ children, className = '', numberOfLines, selectable }: TextProps) {
  return (
    <Text numberOfLines={numberOfLines} selectable={selectable} className={`text-base leading-6 text-ink ${className}`}>
      {children}
    </Text>
  );
}

export function Muted({ children, className = '', numberOfLines }: TextProps) {
  return (
    <Text numberOfLines={numberOfLines} className={`text-sm leading-5 text-ink-muted ${className}`}>
      {children}
    </Text>
  );
}

export function Label({ children, className = '' }: TextProps) {
  return <Text className={`text-sm font-semibold text-ink ${className}`}>{children}</Text>;
}
