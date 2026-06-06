import 'text-encoding';
import { decode, encode } from 'base-64';

if (!global.btoa) {
    global.btoa = encode;
}

if (!global.atob) {
    global.atob = decode;
}

// We rely on Dependency Injection in App.tsx instead of aggressively overwriting global.crypto,
// which is known to cause native panics/crashes on some Android devices.
