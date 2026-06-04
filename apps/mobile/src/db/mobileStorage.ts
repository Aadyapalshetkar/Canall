import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MobileIdentity {
  userId: string;
  deviceId: string;
  encryptionPrivateKey: any; // Serialized or handled by CryptoService
  encryptionPublicKey: string;
  signingPrivateKey: any;
  signingPublicKey: string;
}

export const mobileDb = {
  saveIdentity: async (identity: any) => {
    await AsyncStorage.setItem('identity', JSON.stringify(identity));
  },
  getIdentity: async () => {
    const data = await AsyncStorage.getItem('identity');
    return data ? JSON.parse(data) : null;
  },
  saveContact: async (contact: any) => {
    const contacts = await mobileDb.getContacts();
    contacts[contact.userId] = contact;
    await AsyncStorage.setItem('contacts', JSON.stringify(contacts));
  },
  getContacts: async () => {
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
  }
};
