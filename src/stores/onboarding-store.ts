import { create } from 'zustand';

import type { AuthProvider, HeightUnit, Sex, WeightUnit } from '@/lib/db/models';
import type { PinRecord } from '@/lib/security/pin';

/**
 * First-launch answers held in memory only. Nothing is written to disk until the
 * "Set up secure storage" step, so abandoning onboarding leaves no partial profile behind.
 */
export interface OnboardingDraft {
  authProvider: AuthProvider | null;
  authSubject: string | null;
  email: string | null;
  displayName: string;
  pinRecord: PinRecord | null;
  sex: Sex | null;
  birthDate: string | null;
  heightValue: number | null;
  heightUnit: HeightUnit;
  weightValue: number | null;
  weightUnit: WeightUnit;
  acknowledgedDisclosure: boolean;
}

const EMPTY: OnboardingDraft = {
  authProvider: null,
  authSubject: null,
  email: null,
  displayName: '',
  pinRecord: null,
  sex: null,
  birthDate: null,
  heightValue: null,
  heightUnit: 'cm',
  weightValue: null,
  weightUnit: 'kg',
  acknowledgedDisclosure: false,
};

interface OnboardingStore {
  draft: OnboardingDraft;
  update(patch: Partial<OnboardingDraft>): void;
  reset(): void;
}

export const useOnboardingStore = create<OnboardingStore>()((set) => ({
  draft: EMPTY,
  update: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  reset: () => set({ draft: EMPTY }),
}));
