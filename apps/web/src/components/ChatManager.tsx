import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { CryptoService, WSFrame, RoutedMessagePayload, FetchKeyResponsePayload } from 'shared';
import { db, LocalIdentity, Contact, Message } from '../db/schema';
import { useLiveQuery } from 'dexie-react-hooks';

interface SessionIdentity {
  data: LocalIdentity;
  encPrivate: CryptoKey;
  signPrivate: CryptoKey;
}

interface ChatContextType {
  identity: LocalIdentity | null;
  contacts: Contact[];
  activeContact: Contact | null;
  setActiveContact: (contact: Contact | null) => void;
  sendMessage: (content: string) => Promise<void>;
  addContact: (userId: string) => Promise<void>;
  deleteContact: (userId: string) => Promise<void>;
  renameContact: (userId: string, name: string) => Promise<void>;
  resetIdentity: () => Promise<void>;
  isConnected: boolean;
  error: string | null;
  setError: (error: string | null) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<SessionIdentity | null>(null);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const cryptoService = useRef(new CryptoService());

  const contacts = useLiveQuery(() => db.contacts.toArray(), []) || [];

  useEffect(() => {
    initIdentity();
  }, []);

  useEffect(() => {
    if (session) {
      connectToRelay();
    }
    return () => socketRef.current?.close();
  }, [session]);

  const initIdentity = async () => {
    const existing = await db.identities.toCollection().first();
    if (existing) {
      try {
        const encPrivate = await cryptoService.current.importPrivateKey(existing.encryptionPrivateKeyJWK, 'ECDH');
        const signPrivate = await cryptoService.current.importPrivateKey(existing.signingPrivateKeyJWK, 'ECDSA');
        setSession({ data: existing, encPrivate, signPrivate });
      } catch (err) {
        console.error('Failed to reload identity keys:', err);
        setError('Security context corrupted. Please reset identity.');
      }
    } else {
      const userId = `user_${Math.random().toString(36).substring(7)}`;
      const { encryptionKeys, signingKeys } = await cryptoService.current.generateIdentityKeys();
      
      const encPrivateJWK = await cryptoService.current.exportPrivateKey(encryptionKeys.privateKey);
      const encPublicJWK = await cryptoService.current.exportPublicKey(encryptionKeys.publicKey);
      const signPrivateJWK = await cryptoService.current.exportPrivateKey(signingKeys.privateKey);
      const signPublicJWK = await cryptoService.current.exportPublicKey(signingKeys.publicKey);

      const newIdentity: LocalIdentity = {
        userId,
        deviceId: uuidv4(),
        encryptionPrivateKeyJWK: encPrivateJWK,
        encryptionPublicKeyJWK: encPublicJWK,
        signingPrivateKeyJWK: signPrivateJWK,
        signingPublicKeyJWK: signPublicJWK,
        publicKeyBase64: encPublicJWK, // Using JWK as the exchange format now
        signatureKeyBase64: signPublicJWK,
      };

      await db.identities.add(newIdentity);
      setSession({ data: newIdentity, encPrivate: encryptionKeys.privateKey, signPrivate: signingKeys.privateKey });
    }
  };

  const connectToRelay = () => {
    if (!session) return;

    const relayUrl = import.meta.env.VITE_RELAY_URL || 'ws://localhost:4000';
    const ws = new WebSocket(relayUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      ws.send(JSON.stringify({
        type: 'REGISTER',
        payload: {
          userId: session.data.userId,
          deviceId: session.data.deviceId,
          publicKey: session.data.publicKeyBase64,
          signatureKey: session.data.signatureKeyBase64,
        },
      }));
    };

    ws.onmessage = async (event) => {
      const frame: WSFrame = JSON.parse(event.data);
      handleIncomingFrame(frame);
    };

    ws.onclose = () => {
      setIsConnected(false);
      setTimeout(connectToRelay, 3000);
    };

    ws.onerror = () => setError('Relay offline.');
  };

  const handleIncomingFrame = async (frame: WSFrame) => {
    switch (frame.type) {
      case 'FETCH_KEY_RESPONSE':
        const res = frame.payload as FetchKeyResponsePayload;
        await db.contacts.put({
          userId: res.targetUserId,
          publicKey: res.publicKey,
          signatureKey: res.signatureKey,
        });
        break;
      case 'ROUTED_MESSAGE':
        await handleIncomingMessage(frame.payload);
        break;
      case 'ERROR':
        setError(frame.payload.message);
        break;
    }
  };

  const handleIncomingMessage = async (payload: RoutedMessagePayload) => {
    if (!session) return;

    try {
      let contact = await db.contacts.get(payload.senderId);
      if (!contact) {
        socketRef.current?.send(JSON.stringify({ type: 'FETCH_KEY', payload: { targetUserId: payload.senderId } }));
        let attempts = 0;
        while (!contact && attempts < 20) {
          await new Promise(r => setTimeout(r, 200));
          contact = await db.contacts.get(payload.senderId);
          attempts++;
        }
      }
      if (!contact) throw new Error('Key fetch timeout');

      const senderEncKey = await cryptoService.current.importPublicKey(contact.publicKey, 'ECDH');
      const senderSignKey = await cryptoService.current.importPublicKey(contact.signatureKey, 'ECDSA');

      // 1. Verify Signature
      const isSigned = await cryptoService.current.verify(payload.ciphertext, payload.signature, senderSignKey);
      if (!isSigned) throw new Error('BAD_SIGNATURE');

      // 2. Decrypt
      const sessionKey = await cryptoService.current.deriveSessionKey(session.encPrivate, senderEncKey);
      const plaintext = await cryptoService.current.decrypt(payload.ciphertext, payload.iv, sessionKey);

      await db.messages.add({
        id: payload.id,
        senderId: payload.senderId,
        targetUserId: session.data.userId,
        timestamp: payload.timestamp,
        content: plaintext,
        isMe: false,
        status: 'delivered',
      });

      socketRef.current?.send(JSON.stringify({ type: 'DELIVERY_ACK', payload: { messageId: payload.id, recipientId: session.data.userId } }));
    } catch (err: any) {
      console.error('Decryption fail:', err);
      if (err.message === 'BAD_SIGNATURE') {
        setError(`Security: Verification failed for ${payload.senderId}`);
      } else {
        setError(`Security: Decryption failed. Key mismatch?`);
      }
    }
  };

  const sendMessage = async (content: string) => {
    if (!session || !activeContact || !socketRef.current) return;

    try {
      const targetEncKey = await cryptoService.current.importPublicKey(activeContact.publicKey, 'ECDH');
      const sessionKey = await cryptoService.current.deriveSessionKey(session.encPrivate, targetEncKey);
      const { ciphertext, iv } = await cryptoService.current.encrypt(content, sessionKey);
      const signature = await cryptoService.current.sign(ciphertext, session.signPrivate);

      const messageId = uuidv4();
      const payload: RoutedMessagePayload = {
        id: messageId,
        senderId: session.data.userId,
        targetUserId: activeContact.userId,
        timestamp: Date.now(),
        ciphertext,
        iv,
        signature,
      };

      socketRef.current.send(JSON.stringify({ type: 'ROUTED_MESSAGE', payload }));
      await db.messages.add({
        id: messageId,
        senderId: session.data.userId,
        targetUserId: activeContact.userId,
        timestamp: payload.timestamp,
        content,
        isMe: true,
        status: 'pending',
      });
    } catch (err) {
      console.error('Send fail:', err);
      setError('Failed to encrypt message.');
    }
  };

  const addContact = async (userId: string) => {
    if (!socketRef.current) return;
    setError(null);
    socketRef.current.send(JSON.stringify({ type: 'FETCH_KEY', payload: { targetUserId: userId.trim() } }));
  };

  const deleteContact = async (userId: string) => {
    await db.contacts.delete(userId);
    await db.messages.where('senderId').equals(userId).or('targetUserId').equals(userId).delete();
    if (activeContact?.userId === userId) setActiveContact(null);
  };

  const renameContact = async (userId: string, name: string) => {
    await db.contacts.update(userId, { nickname: name });
    if (activeContact?.userId === userId) {
      setActiveContact({ ...activeContact, nickname: name });
    }
  };

  const resetIdentity = async () => {
    await db.identities.clear();
    await db.contacts.clear();
    await db.messages.clear();
    window.location.reload();
  };

  return (
    <ChatContext.Provider value={{ 
      identity: session?.data || null, 
      contacts, 
      activeContact, 
      setActiveContact, 
      sendMessage, 
      addContact,
      deleteContact,
      renameContact,
      resetIdentity,
      isConnected,
      error,
      setError
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within ChatProvider');
  return context;
};
