import 'text-encoding';
import { decode, encode } from 'base-64';

if (!global.btoa) {
    global.btoa = encode;
}

if (!global.atob) {
    global.atob = decode;
}

// Polyfill Web Crypto API using pure JS (Safe, no native crashes)
import polyfillCrypto from 'polyfill-crypto-methods';
if (!global.crypto || !global.crypto.subtle) {
  // @ts-ignore
  global.crypto = polyfillCrypto;
}
