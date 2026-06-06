import 'text-encoding';
import { decode, encode } from 'base-64';

if (!global.btoa) {
    global.btoa = encode;
}

if (!global.atob) {
    global.atob = decode;
}

// @ts-ignore
import crypto from 'isomorphic-webcrypto';

if (!global.crypto) {
    // @ts-ignore
    global.crypto = crypto;
} else if (!global.crypto.subtle) {
    // @ts-ignore
    global.crypto.subtle = crypto.subtle;
}
