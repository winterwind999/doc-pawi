import * as Crypto from 'expo-crypto';

/** Random RFC 4122 v4 identifier used as the primary key of every row. */
export const newId = (): string => Crypto.randomUUID();
