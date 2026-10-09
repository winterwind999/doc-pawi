// Unit tests run in Node: no native modules, no network, no Android device.
// Mocks below replace native-only modules that some imported files reference at load time.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri)).join('/');
    }
    get exists() {
      return false;
    }
    create() {}
    delete() {}
  }
  class File extends Directory {}
  return { Directory, File, Paths: { document: { uri: 'file:///doc' }, cache: { uri: 'file:///cache' }, availableDiskSpace: 1e12 } };
});

jest.mock('@/lib/native', () => ({
  DocPawiNative: {
    pbkdf2Sha256: jest.fn(async (pin: string, salt: string) => `hash:${pin}:${salt}`),
    encryptToVault: jest.fn(),
    recognizeText: jest.fn(),
    sha256File: jest.fn(),
    decryptFromVault: jest.fn(),
    deleteVaultKey: jest.fn(),
    getDeviceProfile: jest.fn(() => null),
  },
  toNativePath: (p: string) => p.replace(/^file:\/\//, ''),
  isNativeAvailable: () => false,
}));
