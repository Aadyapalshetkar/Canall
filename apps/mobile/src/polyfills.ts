import 'text-encoding';
import { decode, encode } from 'base-64';

// 1. Basic string encoding for crypto operations
if (!global.btoa) {
    global.btoa = encode;
}

if (!global.atob) {
    global.atob = decode;
}

// 2. High-performance native crypto bindings
// This safely injects global.crypto.subtle into the React Native environment.
import { polyfillWebCrypto } from 'react-native-quick-crypto';
polyfillWebCrypto();
