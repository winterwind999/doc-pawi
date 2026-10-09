import { requireOptionalNativeModule } from 'expo';

/**
 * Typed access to the app's local Expo module (`modules/doc-pawi-native`, Kotlin). It provides the
 * on-device pieces that JavaScript cannot do efficiently or safely:
 * - ML Kit text recognition (bundled Latin model) for images and rendered PDF pages,
 * - AES-256-GCM document encryption with non-exportable Android Keystore keys,
 * - streaming SHA-256 for multi-gigabyte model files,
 * - PBKDF2 for PIN verifiers,
 * - device hardware details for the model disclosure screen.
 */

export interface OcrPage {
  index: number;
  text: string;
  width: number;
  height: number;
}

export interface OcrResult {
  text: string;
  pages: OcrPage[];
  pageCount: number;
  /** True when the PDF had more pages than were processed. */
  truncated: boolean;
  engine: string;
}

export interface VaultWriteResult {
  size: number;
  sha256: string;
}

export interface DeviceProfile {
  manufacturer: string;
  model: string;
  androidVersion: string;
  sdkInt: number;
  socManufacturer: string | null;
  socModel: string | null;
  hardware: string;
  supportedAbis: string[];
  cpuCores: number;
  totalRamBytes: number;
  availableRamBytes: number;
  lowRamDevice: boolean;
}

interface NativeModuleShape {
  encryptToVault(sourceUri: string, destPath: string, keyAlias: string): Promise<VaultWriteResult>;
  decryptFromVault(srcPath: string, destPath: string, keyAlias: string): Promise<void>;
  deleteVaultKey(keyAlias: string): Promise<boolean>;
  recognizeText(vaultPath: string, mimeType: string, keyAlias: string, maxPages: number): Promise<OcrResult>;
  sha256File(path: string): Promise<string>;
  pbkdf2Sha256(password: string, saltHex: string, iterations: number, keyLengthBytes: number): Promise<string>;
  getDeviceProfile(): DeviceProfile;
}

const native = requireOptionalNativeModule<NativeModuleShape>('DocPawiNative');

export class NativeModuleUnavailableError extends Error {
  constructor() {
    super(
      'Doc Pawi native features are unavailable in this build. Use the Android development or release build (not Expo Go or the web).',
    );
  }
}

function required(): NativeModuleShape {
  if (!native) throw new NativeModuleUnavailableError();
  return native;
}

export const isNativeAvailable = () => native != null;

/** Converts a `file://` URI to a plain filesystem path for native code. */
export function toNativePath(uriOrPath: string): string {
  if (!uriOrPath.startsWith('file://')) return uriOrPath;
  return decodeURIComponent(uriOrPath.slice('file://'.length));
}

export const DocPawiNative = {
  encryptToVault: (sourceUri: string, destPath: string, keyAlias: string) =>
    required().encryptToVault(sourceUri, toNativePath(destPath), keyAlias),
  decryptFromVault: (srcPath: string, destPath: string, keyAlias: string) =>
    required().decryptFromVault(toNativePath(srcPath), toNativePath(destPath), keyAlias),
  deleteVaultKey: (keyAlias: string) => required().deleteVaultKey(keyAlias),
  recognizeText: (vaultPath: string, mimeType: string, keyAlias: string, maxPages = 5) =>
    required().recognizeText(toNativePath(vaultPath), mimeType, keyAlias, maxPages),
  sha256File: (path: string) => required().sha256File(toNativePath(path)),
  pbkdf2Sha256: (password: string, saltHex: string, iterations: number, keyLengthBytes: number) =>
    required().pbkdf2Sha256(password, saltHex, iterations, keyLengthBytes),
  getDeviceProfile: (): DeviceProfile | null => (native ? native.getDeviceProfile() : null),
};
