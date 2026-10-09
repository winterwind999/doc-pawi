import { randomBytes, randomUUID as nodeRandomUUID } from 'node:crypto';

/** Node-backed stand-in for expo-crypto in unit tests. */
export const randomUUID = () => nodeRandomUUID();
export const getRandomBytes = (n: number) => new Uint8Array(randomBytes(n));
