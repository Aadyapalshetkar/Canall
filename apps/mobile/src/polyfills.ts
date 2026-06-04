import 'text-encoding';
import { decode, encode } from 'base-64';

if (!global.btoa) {
    global.btoa = encode;
}

if (!global.atob) {
    global.atob = decode;
}

// Polyfill for SubtleCrypto if not already present via expo-crypto
// Note: Expo Crypto provides a lot of these but we ensure compatibility.
import * as Crypto from 'expo-crypto';

// If subtle is missing, we could use a pure JS fallback for testing
// but for E2EE performance, we'll assume Expo's native support or JSI.
if (!global.crypto) {
  // @ts-ignore
  global.crypto = {
    getRandomValues: (buffer: any) => Crypto.getRandomBytes(buffer.length),
    // We'll rely on our shared package logic which looks for window.crypto or global.crypto
    subtle: (global as any).crypto?.subtle
  };
}
