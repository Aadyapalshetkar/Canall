import 'text-encoding';
import { decode, encode } from 'base-64';
import { polyfillWebCrypto } from 'react-native-quick-crypto';

if (!global.btoa) {
    global.btoa = encode;
}

if (!global.atob) {
    global.atob = decode;
}

// This sets up global.crypto.subtle correctly using high-performance native code
polyfillWebCrypto();
