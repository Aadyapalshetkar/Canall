import Dexie, { Table } from 'dexie';

export interface LocalIdentity {
  id?: number;
  userId: string;
  deviceId: string;
  encryptionPrivateKey: CryptoKey;
  encryptionPublicKey: CryptoKey;
  signingPrivateKey: CryptoKey;
  signingPublicKey: CryptoKey;
  publicKeyBase64: string;
  signatureKeyBase64: string;
}

export interface Contact {
  userId: string;
  publicKey: string;
  signatureKey: string;
  lastSeen?: number;
}

export interface Message {
  id: string; // From the relay server
  localId?: number;
  senderId: string;
  targetUserId: string;
  timestamp: number;
  content: string; // Decrypted plaintext
  isMe: boolean;
  status: 'pending' | 'delivered' | 'read';
}

export class CanallDatabase extends Dexie {
  identities!: Table<LocalIdentity>;
  contacts!: Table<Contact>;
  messages!: Table<Message>;

  constructor() {
    super('CanallDB');
    this.version(1).stores({
      identities: '++id, userId',
      contacts: 'userId',
      messages: '++localId, id, senderId, targetUserId, timestamp',
    });
  }
}

export const db = new CanallDatabase();
