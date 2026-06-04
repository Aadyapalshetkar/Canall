import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { CryptoService, WSFrame, RoutedMessagePayload, FetchKeyResponsePayload } from 'shared';
import { db, LocalIdentity, Contact, Message } from '../db/schema';

import { useLiveQuery } from 'dexie-react-hooks';

interface ChatContextType {
  identity: LocalIdentity | null;
  contacts: Contact[];
  activeContact: Contact | null;
  setActiveContact: (contact: Contact | null) => void;
  sendMessage: (content: string) => Promise<void>;
  addContact: (userId: string) => Promise<void>;
  isConnected: boolean;
  error: string | null;
  setError: (error: string | null) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [identity, setIdentity] = useState<LocalIdentity | null>(null);
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
    if (identity) {
      connectToRelay();
    }
    return () => socketRef.current?.close();
  }, [identity]);

  const initIdentity = async () => {
    const existing = await db.identities.toCollection().first();
    if (existing) {
      setIdentity(existing);
    } else {
      // Create new identity
      const userId = `user_${Math.random().toString(36).substring(7)}`;
      const { encryptionKeys, signingKeys } = await cryptoService.current.generateIdentityKeys();
      
      const publicKeyBase64 = await cryptoService.current.exportPublicKey(encryptionKeys.publicKey);
      const signatureKeyBase64 = await cryptoService.current.exportPublicKey(signingKeys.publicKey);

      const newIdentity: LocalIdentity = {
        userId,
        deviceId: uuidv4(),
        encryptionPrivateKey: encryptionKeys.privateKey,
        encryptionPublicKey: encryptionKeys.publicKey,
        signingPrivateKey: signingKeys.privateKey,
        signingPublicKey: signingKeys.publicKey,
        publicKeyBase64,
        signatureKeyBase64,
      };

      await db.identities.add(newIdentity);
      setIdentity(newIdentity);
    }
  };

  const connectToRelay = () => {
    if (!identity) return;

    const relayUrl = import.meta.env.VITE_RELAY_URL || 'ws://localhost:4000';
    const ws = new WebSocket(relayUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      // Register with relay
      const registerFrame: WSFrame = {
        type: 'REGISTER',
        payload: {
          userId: identity.userId,
          deviceId: identity.deviceId,
          publicKey: identity.publicKeyBase64,
          signatureKey: identity.signatureKeyBase64,
        },
      };
      ws.send(JSON.stringify(registerFrame));
    };

    ws.onmessage = async (event) => {
      const frame: WSFrame = JSON.parse(event.data);
      handleIncomingFrame(frame);
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Try to reconnect after 3 seconds
      setTimeout(connectToRelay, 3000);
    };

    ws.onerror = () => {
      setError('Connection failed. Server might be offline.');
    };
  };

  const handleIncomingFrame = async (frame: WSFrame) => {
    switch (frame.type) {
      case 'FETCH_KEY_RESPONSE':
        const res = frame.payload as FetchKeyResponsePayload;
        const newContact: Contact = {
          userId: res.targetUserId,
          publicKey: res.publicKey,
          signatureKey: res.signatureKey,
        };
        await db.contacts.put(newContact);
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
    if (!identity) return;

    try {
      // 1. Get sender public keys
      let contact = await db.contacts.get(payload.senderId);
      
      if (!contact) {
        console.log(`Unknown sender ${payload.senderId}. Fetching keys...`);
        // Request keys from server
        socketRef.current?.send(JSON.stringify({
          type: 'FETCH_KEY',
          payload: { targetUserId: payload.senderId }
        }));
        
        // Wait briefly for the FETCH_KEY_RESPONSE to update the DB
        let attempts = 0;
        while (!contact && attempts < 10) {
          await new Promise(r => setTimeout(r, 200));
          contact = await db.contacts.get(payload.senderId);
          attempts++;
        }
      }

      if (!contact) throw new Error('Could not retrieve sender keys');

      // 2. Import keys
      const senderEncryptionKey = await cryptoService.current.importPublicKey(contact.publicKey, 'ECDH');
      const senderSigningKey = await cryptoService.current.importPublicKey(contact.signatureKey, 'ECDSA');

      // 3. Verify Signature
      const isValid = await cryptoService.current.verify(payload.ciphertext, payload.signature, senderSigningKey);
      if (!isValid) throw new Error('Signature verification failed');

      // 4. Derive Session Key
      const sessionKey = await cryptoService.current.deriveSessionKey(identity.encryptionPrivateKey, senderEncryptionKey);

      // 5. Decrypt
      const plaintext = await cryptoService.current.decrypt(payload.ciphertext, payload.iv, sessionKey);

      // 6. Save to DB
      const newMessage: Message = {
        id: payload.id,
        senderId: payload.senderId,
        targetUserId: identity.userId,
        timestamp: payload.timestamp,
        content: plaintext,
        isMe: false,
        status: 'delivered',
      };
      await db.messages.add(newMessage);

      // 7. Send ACK
      socketRef.current?.send(JSON.stringify({
        type: 'DELIVERY_ACK',
        payload: { messageId: payload.id, recipientId: identity.userId }
      }));
    } catch (err) {
      console.error('Failed to handle incoming message:', err);
    }
  };

  const sendMessage = async (content: string) => {
    if (!identity || !activeContact || !socketRef.current) return;

    try {
      // 1. Import target public keys
      const targetEncryptionKey = await cryptoService.current.importPublicKey(activeContact.publicKey, 'ECDH');

      // 2. Derive Session Key
      const sessionKey = await cryptoService.current.deriveSessionKey(identity.encryptionPrivateKey, targetEncryptionKey);

      // 3. Encrypt
      const { ciphertext, iv } = await cryptoService.current.encrypt(content, sessionKey);

      // 4. Sign
      const signature = await cryptoService.current.sign(ciphertext, identity.signingPrivateKey);

      // 5. Build Payload
      const messageId = uuidv4();
      const payload: RoutedMessagePayload = {
        id: messageId,
        senderId: identity.userId,
        targetUserId: activeContact.userId,
        timestamp: Date.now(),
        ciphertext,
        iv,
        signature,
      };

      // 6. Send
      socketRef.current.send(JSON.stringify({ type: 'ROUTED_MESSAGE', payload }));

      // 7. Save locally
      await db.messages.add({
        id: messageId,
        senderId: identity.userId,
        targetUserId: activeContact.userId,
        timestamp: payload.timestamp,
        content,
        isMe: true,
        status: 'pending',
      });
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const addContact = async (userId: string) => {
    if (!socketRef.current) return;
    setError(null);
    socketRef.current.send(JSON.stringify({
      type: 'FETCH_KEY',
      payload: { targetUserId: userId.trim() }
    }));
  };

  return (
    <ChatContext.Provider value={{ 
      identity, 
      contacts, 
      activeContact, 
      setActiveContact, 
      sendMessage, 
      addContact,
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
