import { router } from 'expo-router';
import { useState } from 'react';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { Screen } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import type { HmoRow } from '@/lib/db/models';
import { insertHmo, updateHmo } from '@/lib/db/repositories/hmos';
import { fieldErrors, hmoInputSchema } from '@/lib/validation/schemas';
import { useUnlockedSession } from '@/stores/session-store';

export function HmoForm({ existing }: { existing?: HmoRow }) {
  const { db, profileId } = useUnlockedSession();
  const [provider, setProvider] = useState(existing?.provider_name ?? '');
  const [plan, setPlan] = useState(existing?.plan_name ?? '');
  const [memberId, setMemberId] = useState(existing?.member_id ?? '');
  const [validUntil, setValidUntil] = useState(existing?.valid_until ?? '');
  const [coverage, setCoverage] = useState(existing?.coverage_notes ?? '');
  const [hotline, setHotline] = useState(existing?.hotline ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsed = hmoInputSchema.safeParse({
      provider_name: provider,
      plan_name: plan,
      member_id: memberId,
      valid_until: validUntil,
      coverage_notes: coverage,
      hotline,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        await updateHmo(db, existing.id, parsed.data);
        router.back();
      } else {
        const id = await insertHmo(db, { profileId, input: parsed.data, sourceType: 'manual' });
        router.replace({ pathname: '/hmo/[id]', params: { id } });
      }
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['bottom']} footer={<Button label={existing ? 'Save changes' : 'Save HMO'} icon="content-save-outline" loading={saving} onPress={() => void save()} />}>
      <TextField label="HMO or insurance provider" value={provider} onChangeText={setProvider} required error={errors.provider_name} />
      <TextField label="Plan" value={plan} onChangeText={setPlan} error={errors.plan_name} />
      <TextField label="Member ID" value={memberId} onChangeText={setMemberId} autoCapitalize="characters" error={errors.member_id} hint="Stored only in your encrypted vault." />
      <DateField label="Valid until" value={validUntil} onChange={setValidUntil} error={errors.valid_until} quickPicks="none" />
      <TextField label="Hotline" value={hotline} onChangeText={setHotline} keyboardType="phone-pad" error={errors.hotline} />
      <TextField label="Coverage notes" value={coverage} onChangeText={setCoverage} multiline error={errors.coverage_notes} hint="Copy what your HMO told you; Doc Pawi does not verify coverage." />
      {failure ? <Banner tone="danger">{failure}</Banner> : null}
    </Screen>
  );
}
