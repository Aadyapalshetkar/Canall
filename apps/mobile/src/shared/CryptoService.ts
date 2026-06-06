/**
 * Canall CryptoService
 * High-compatibility implementation for cross-platform E2EE.
 */

export class CryptoService {
  private crypto: SubtleCrypto;
  private cryptoObject: any;

  constructor(injectedCrypto?: any) {
    const globalCrypto = injectedCrypto || 
                         (typeof globalThis !== 'undefined' ? globalThis.crypto : null) ||
                         (typeof window !== 'undefined' ? window.crypto : null);
    
    if (!globalCrypto || !globalCrypto.subtle) {
      throw new Error('WebCrypto API not found');
    }
    
    this.cryptoObject = globalCrypto;
    this.crypto = globalCrypto.subtle;
  }

  async generateIdentityKeys() {
    const encryptionKeys = await this.crypto.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true, 
      ['deriveKey', 'deriveBits']
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

  async exportPublicKey(key: CryptoKey): Promise<string> {
    const exported = await this.crypto.exportKey('jwk', key);
    return JSON.stringify(exported);
  }

  async exportPrivateKey(key: CryptoKey): Promise<string> {
    const exported = await this.crypto.exportKey('jwk', key);
    return JSON.stringify(exported);
  }

  async importPublicKey(jwkString: string, type: 'ECDH' | 'ECDSA'): Promise<CryptoKey> {
    const jwk = JSON.parse(jwkString);
    const algorithm = type === 'ECDH' 
      ? { name: 'ECDH', namedCurve: 'P-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' };
    
    return await this.crypto.importKey(
      'jwk',
      jwk,
      algorithm,
      true,
      type === 'ECDH' ? [] : ['verify']
    );
  }

  async importPrivateKey(jwkString: string, type: 'ECDH' | 'ECDSA'): Promise<CryptoKey> {
    const jwk = JSON.parse(jwkString);
    const algorithm = type === 'ECDH' 
      ? { name: 'ECDH', namedCurve: 'P-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' };
    
    return await this.crypto.importKey(
      'jwk',
      jwk,
      algorithm,
      true,
      type === 'ECDH' ? ['deriveKey', 'deriveBits'] : ['sign']
    );
  }

  async deriveSessionKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
    const sharedBits = await this.crypto.deriveBits(
      { name: 'ECDH', public: publicKey },
      privateKey,
      256
    );

    const sharedSecretKey = await this.crypto.importKey(
      'raw',
      sharedBits,
      { name: 'HKDF' },
      false,
      ['deriveKey']
    );

    return await this.crypto.deriveKey(
      {
        name: 'HKDF',
        salt: new Uint8Array(16), 
        info: new TextEncoder().encode('canall-v1-session'),
        hash: 'SHA-256',
      },
      sharedSecretKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

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

  async sign(data: string, privateKey: CryptoKey): Promise<string> {
    // Sign the raw bytes of the ciphertext string
    const encoded = new TextEncoder().encode(data);
    const signature = await this.crypto.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      encoded
    );
    return this.arrayBufferToBase64(signature);
  }

  async verify(data: string, signature: string, publicKey: CryptoKey): Promise<boolean> {
    const encoded = new TextEncoder().encode(data);
    const sigBuffer = this.base64ToArrayBuffer(signature);
    
    return await this.crypto.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      sigBuffer,
      encoded
    );
  }

  // --- COMPATIBILITY HELPERS ---

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
