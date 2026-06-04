/**
 * Canall CryptoService
 * Uses standard Web Crypto API (SubtleCrypto)
 * 
 * Algorithm Choices:
 * - Key Exchange: ECDH (P-256)
 * - Signatures: ECDSA (P-256)
 * - Message Encryption: AES-GCM (256-bit)
 * - Key Derivation: HKDF (SHA-256)
 */

export class CryptoService {
  private crypto: SubtleCrypto;
  private cryptoObject: Crypto;

  constructor() {
    if (typeof window !== 'undefined' && window.crypto) {
      this.cryptoObject = window.crypto;
      this.crypto = window.crypto.subtle;
    } else {
      // Node.js environment
      const { webcrypto } = require('crypto');
      this.cryptoObject = webcrypto;
      this.crypto = webcrypto.subtle;
    }
  }

  // --- KEY GENERATION ---

  async generateIdentityKeys() {
    const encryptionKeys = await this.crypto.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true, 
      ['deriveKey']
    );

    const signingKeys = await this.crypto.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );

    return { 
      encryptionKeys: encryptionKeys as CryptoKeyPair, 
      signingKeys: signingKeys as CryptoKeyPair 
    };
  }

  async generateEphemeralKeys() {
    return await this.crypto.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    ) as CryptoKeyPair;
  }

  // --- EXPORT/IMPORT ---

  async exportPublicKey(key: CryptoKey): Promise<string> {
    const exported = await this.crypto.exportKey('spki', key);
    return this.arrayBufferToBase64(exported);
  }

  async importPublicKey(base64Key: string, type: 'ECDH' | 'ECDSA'): Promise<CryptoKey> {
    const buffer = this.base64ToArrayBuffer(base64Key);
    const algorithm = type === 'ECDH' 
      ? { name: 'ECDH', namedCurve: 'P-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' };
    
    return await this.crypto.importKey(
      'spki',
      buffer,
      algorithm,
      true,
      type === 'ECDH' ? [] : ['verify']
    );
  }

  // --- KEY AGREEMENT & DERIVATION ---

  async deriveSessionKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
    return await this.crypto.deriveKey(
      { name: 'ECDH', public: publicKey },
      privateKey,
      { name: 'AES-GCM', length: 256 },
      false, 
      ['encrypt', 'decrypt']
    );
  }

  // --- ENCRYPTION / DECRYPTION ---

  async encrypt(plaintext: string, key: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
    const iv = this.cryptoObject.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    
    const ciphertext = await this.crypto.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    return {
      ciphertext: this.arrayBufferToBase64(ciphertext),
      iv: this.arrayBufferToBase64(iv.buffer as ArrayBuffer)
    };
  }

  async decrypt(ciphertext: string, iv: string, key: CryptoKey): Promise<string> {
    const cipherBuffer = this.base64ToArrayBuffer(ciphertext);
    const ivBuffer = this.base64ToArrayBuffer(iv);

    const decrypted = await this.crypto.decrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      key,
      cipherBuffer
    );

    return new TextDecoder().decode(decrypted);
  }

  // --- SIGNING ---

  async sign(data: string, privateKey: CryptoKey): Promise<string> {
    const encoded = new TextEncoder().encode(data);
    const signature = await this.crypto.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      privateKey,
      encoded
    );
    return this.arrayBufferToBase64(signature);
  }

  async verify(data: string, signature: string, publicKey: CryptoKey): Promise<boolean> {
    const encoded = new TextEncoder().encode(data);
    const sigBuffer = this.base64ToArrayBuffer(signature);
    
    return await this.crypto.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      publicKey,
      encoded,
      sigBuffer
    );
  }

  // --- HELPERS ---

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    if (typeof btoa !== 'undefined') {
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        const byte = bytes[i];
        if (byte !== undefined) {
          binary += String.fromCharCode(byte);
        }
      }
      return btoa(binary);
    } else {
      // @ts-ignore
      return Buffer.from(buffer).toString('base64');
    }
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    if (typeof atob !== 'undefined') {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    } else {
      // @ts-ignore
      const buf = Buffer.from(base64, 'base64');
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }
  }
}
