/**
 * Raw color values for APIs that cannot take a className (icons, navigation options,
 * ActivityIndicator). Keep in sync with tailwind.config.js.
 */
export const colors = {
  primary: '#589039',
  primary50: '#F2F8EE',
  primary100: '#E2F0D9',
  primary600: '#47772E',
  primary700: '#3A5F26',
  sand500: '#D89536',
  sand700: '#93591F',
  ocean500: '#3F7A9C',
  ocean600: '#33637F',
  coral500: '#D4504C',
  coral600: '#B23B36',
  ink: '#1B2418',
  inkMuted: '#5C6A57',
  inkSoft: '#8A9585',
  surface: '#FFFFFF',
  surfaceMuted: '#F6F8F4',
  line: '#E1E7DC',
  white: '#FFFFFF',
} as const;

export type Tone = 'success' | 'pending' | 'danger' | 'info' | 'neutral' | 'ai' | 'demo';

export const toneClasses: Record<Tone, { bg: string; text: string; border: string; icon: string }> = {
  success: { bg: 'bg-primary-50', text: 'text-primary-700', border: 'border-primary-200', icon: colors.primary700 },
  pending: { bg: 'bg-sand-50', text: 'text-sand-700', border: 'border-sand-200', icon: colors.sand700 },
  danger: { bg: 'bg-coral-50', text: 'text-coral-600', border: 'border-coral-200', icon: colors.coral600 },
  info: { bg: 'bg-ocean-50', text: 'text-ocean-600', border: 'border-ocean-200', icon: colors.ocean600 },
  neutral: { bg: 'bg-surface-sunken', text: 'text-ink-muted', border: 'border-line', icon: colors.inkMuted },
  ai: { bg: 'bg-ocean-50', text: 'text-ocean-600', border: 'border-ocean-200', icon: colors.ocean600 },
  demo: { bg: 'bg-olive-100', text: 'text-ink-muted', border: 'border-line', icon: colors.inkMuted },
};
