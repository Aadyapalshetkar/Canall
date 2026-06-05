import 'text-encoding';
import { decode, encode } from 'base-64';

declare var global: any;

if (!global.btoa) {
    global.btoa = encode;
}

if (!global.atob) {
    global.atob = decode;
}
