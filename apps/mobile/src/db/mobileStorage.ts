import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MobileIdentity {
  userId: string;
  deviceId: string;
  encryptionPrivateKeyJWK: string;
  encryptionPublicKeyJWK: string;
  signingPrivateKeyJWK: string;
  signingPublicKeyJWK: string;
  publicKeyBase64: string;
  signatureKeyBase64: string;
}

export interface MobileContact {
  userId: string;
  nickname?: string;
  publicKey: string;
  signatureKey: string;
}

export const mobileDb = {
  saveIdentity: async (identity: MobileIdentity) => {
    await AsyncStorage.setItem('identity', JSON.stringify(identity));
  },
  getIdentity: async (): Promise<MobileIdentity | null> => {
    const data = await AsyncStorage.getItem('identity');
    return data ? JSON.parse(data) : null;
  },
  saveContact: async (contact: MobileContact) => {
    const contacts = await mobileDb.getContacts();
    contacts[contact.userId] = contact;
    await AsyncStorage.setItem('contacts', JSON.stringify(contacts));
  },
  updateContact: async (userId: string, updates: Partial<MobileContact>) => {
    const contacts = await mobileDb.getContacts();
    if (contacts[userId]) {
      contacts[userId] = { ...contacts[userId], ...updates };
      await AsyncStorage.setItem('contacts', JSON.stringify(contacts));
    }
  },
  deleteContact: async (userId: string) => {
    const contacts = await mobileDb.getContacts();
    delete contacts[userId];
    await AsyncStorage.setItem('contacts', JSON.stringify(contacts));
    // Also clear messages for this user
    const messages = await mobileDb.getMessages();
    const filtered = messages.filter((m: any) => m.senderId !== userId && m.targetUserId !== userId);
    await AsyncStorage.setItem('messages', JSON.stringify(filtered));
  },
  getContacts: async (): Promise<Record<string, MobileContact>> => {
    const data = await AsyncStorage.getItem('contacts');
    return data ? JSON.parse(data) : {};
  },
  saveMessage: async (msg: any) => {
    const messages = await mobileDb.getMessages();
    messages.push(msg);
    await AsyncStorage.setItem('messages', JSON.stringify(messages));
    return messages;
  },
  getMessages: async () => {
    const data = await AsyncStorage.getItem('messages');
    return data ? JSON.parse(data) : [];
  },
  clearAll: async () => {
    await AsyncStorage.removeItem('identity');
    await AsyncStorage.removeItem('contacts');
    await AsyncStorage.removeItem('messages');
  }
};
