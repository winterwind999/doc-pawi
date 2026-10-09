import { Asset } from 'expo-asset';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ListItem, Screen, SectionHeader } from '@/components/ui/Layout';
import { formatDate, todayLocal } from '@/lib/dates';
import { runFullPipeline } from '@/lib/services/document-jobs';
import { importDocument, type ImportSource } from '@/lib/services/document-service';
import { useUnlockedSession } from '@/stores/session-store';

const SAMPLE = require('@/assets/samples/synthetic-lab-report.png');

export default function ImportDocumentScreen() {
  const { db, profileId } = useUnlockedSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const finish = async (source: ImportSource, sourceType: 'user' | 'demo' = 'user') => {
    const doc = await importDocument(db, profileId, source, sourceType);
    void runFullPipeline(db, profileId, doc.id);
    router.replace({ pathname: '/documents/[id]', params: { id: doc.id } });
  };

  const guard = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const camera = () =>
    guard('camera', async () => {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setPermissionDenied(true);
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.9 });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      await finish({ uri: a.uri, name: a.fileName ?? `Photo ${formatDate(todayLocal())}.jpg`, mimeType: a.mimeType ?? 'image/jpeg', size: a.fileSize });
    });

  const gallery = () =>
    guard('gallery', async () => {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 1 });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      await finish({ uri: a.uri, name: a.fileName ?? 'Photo.jpg', mimeType: a.mimeType ?? 'image/jpeg', size: a.fileSize });
    });

  const file = () =>
    guard('file', async () => {
      // copyToCacheDirectory: false → the native vault reads the content:// URI directly, so no
      // plaintext copy of the document is written to the app cache.
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: false,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const a = result.assets[0];
      await finish({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size });
    });

  const sample = () =>
    guard('sample', async () => {
      const [asset] = await Asset.loadAsync(SAMPLE);
      if (!asset.localUri) throw new Error('The bundled sample could not be opened.');
      await finish({ uri: asset.localUri, name: 'Synthetic lab report (sample).png', mimeType: 'image/png' }, 'demo');
    });

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: 'Import document' }} />
      <Text className="text-base leading-6 text-ink-muted">
        Doc Pawi encrypts the file on this phone, reads its text with on-device OCR, and then uses the local AI model to
        suggest a record for you to review. Nothing is uploaded.
      </Text>
      <SectionHeader title="Choose a source" />
      <ListItem icon="camera-outline" title="Take a photo" subtitle="Photograph a paper report or prescription" onPress={() => void camera()} />
      <ListItem icon="image-multiple-outline" title="Choose a photo" subtitle="JPEG, PNG, or WebP from your gallery" onPress={() => void gallery()} />
      <ListItem icon="file-pdf-box" title="Choose a file" subtitle="PDF (first 5 pages) or an image file, up to 25 MB" onPress={() => void file()} />
      <SectionHeader title="For evaluation" />
      <ListItem
        icon="flask-outline"
        title="Try the synthetic sample report"
        subtitle="A fictional lab report bundled with the app (marked as demo data)"
        onPress={() => void sample()}
      />
      {busy ? <Banner tone="info">Encrypting and importing…</Banner> : null}
      {permissionDenied ? (
        <Banner tone="pending" title="Camera permission is off" action={<Button label="Open app settings" size="sm" variant="outline" onPress={() => void Linking.openSettings()} />}>
          You can still choose a photo or file instead.
        </Banner>
      ) : null}
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <View className="gap-1 rounded-2xl bg-surface-sunken p-3">
        <Text className="text-sm font-semibold text-ink">Tips for good results</Text>
        <Text className="text-sm leading-5 text-ink-muted">
          Use good light, keep the page flat, and fill the frame. Handwriting and non-Latin scripts are not supported by
          the on-device text recognizer.
        </Text>
      </View>
    </Screen>
  );
}
