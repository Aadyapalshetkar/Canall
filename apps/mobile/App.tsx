import './src/polyfills';
import React, { useEffect, useState, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  SafeAreaView, 
  KeyboardAvoidingView, 
  Platform,
  ScrollView,
  Alert
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
import { Send, UserPlus, Shield, Circle, ChevronLeft, Trash2, Copy, Edit2 } from 'lucide-react-native';
import { CryptoService } from './src/shared/CryptoService';
import { WSFrame, RoutedMessagePayload, FetchKeyResponsePayload } from './src/shared/types';
import { mobileDb, MobileIdentity, MobileContact } from './src/db/mobileStorage';
import { v4 as uuidv4 } from 'uuid';

export default function App() {
  const [identity, setIdentity] = useState<MobileIdentity | null>(null);
  const [sessionKeys, setSessionKeys] = useState<{encPrivate: CryptoKey, signPrivate: CryptoKey} | null>(null);
  const [contacts, setContacts] = useState<Record<string, MobileContact>>({});
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [targetId, setTargetId] = useState('');
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  
  const socketRef = useRef<WebSocket | null>(null);
  const cryptoService = useRef<CryptoService | null>(null);

  useEffect(() => {
    init();
    return () => socketRef.current?.close();
  }, []);

  useEffect(() => {
    if (identity && sessionKeys) {
      connect();
    }
  }, [identity, sessionKeys]);

  const init = async () => {
    try {
      cryptoService.current = new CryptoService();
      
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Notification permission not granted');
      }

      let id = await mobileDb.getIdentity();
      if (id) {
        try {
          const encPrivate = await cryptoService.current.importPrivateKey(id.encryptionPrivateKeyJWK, 'ECDH');
          const signPrivate = await cryptoService.current.importPrivateKey(id.signingPrivateKeyJWK, 'ECDSA');
          setSessionKeys({ encPrivate, signPrivate });
          setIdentity(id);
        } catch (err) {
          console.error('Keys import failed', err);
          setError('Security context corrupted. Reset needed.');
        }
      } else {
        const { encryptionKeys, signingKeys } = await cryptoService.current.generateIdentityKeys();
        const encPrivateJWK = await cryptoService.current.exportPrivateKey(encryptionKeys.privateKey);
        const encPublicJWK = await cryptoService.current.exportPublicKey(encryptionKeys.publicKey);
        const signPrivateJWK = await cryptoService.current.exportPrivateKey(signingKeys.privateKey);
        const signPublicJWK = await cryptoService.current.exportPublicKey(signingKeys.publicKey);

        const newId: MobileIdentity = {
          userId: `mobile_${Math.random().toString(36).substring(7)}`,
          deviceId: 'mobile-device',
          encryptionPrivateKeyJWK: encPrivateJWK,
          encryptionPublicKeyJWK: encPublicJWK,
          signingPrivateKeyJWK: signPrivateJWK,
          signingPublicKeyJWK: signPublicJWK,
          publicKeyBase64: encPublicJWK,
          signatureKeyBase64: signPublicJWK,
        };
        await mobileDb.saveIdentity(newId);
        setSessionKeys({ encPrivate: encryptionKeys.privateKey, signPrivate: signingKeys.privateKey });
        setIdentity(newId);
      }
      setContacts(await mobileDb.getContacts());
      setMessages(await mobileDb.getMessages());
    } catch (err) {
      console.error('App init failed', err);
      setError('Initialization failed. Check permissions.');
    }
  };

  const connect = () => {
    if (!identity) return;
    const ws = new WebSocket('wss://canall-relay.onrender.com');
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      ws.send(JSON.stringify({
        type: 'REGISTER',
        payload: {
          userId: identity.userId,
          deviceId: identity.deviceId,
          publicKey: identity.publicKeyBase64,
          signatureKey: identity.signatureKeyBase64
        }
      }));
    };

    ws.onmessage = async (e) => {
      try {
        const frame: WSFrame = JSON.parse(e.data);
        if (frame.type === 'FETCH_KEY_RESPONSE') {
          const res = frame.payload as FetchKeyResponsePayload;
          const newContact: MobileContact = {
            userId: res.targetUserId,
            publicKey: res.publicKey,
            signatureKey: res.signatureKey,
          };
          await mobileDb.saveContact(newContact);
          setContacts(await mobileDb.getContacts());
        } else if (frame.type === 'ROUTED_MESSAGE') {
          await handleIncomingMessage(frame.payload);
        }
      } catch (err) {
        console.error('Message parsing failed', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setTimeout(connect, 3000);
    };
  };

  const handleIncomingMessage = async (payload: RoutedMessagePayload) => {
    if (!sessionKeys || !identity || !cryptoService.current) return;
    try {
      let contactList = await mobileDb.getContacts();
      let contact = contactList[payload.senderId];
      
      if (!contact) {
        socketRef.current?.send(JSON.stringify({ type: 'FETCH_KEY', payload: { targetUserId: payload.senderId } }));
        await new Promise(r => setTimeout(r, 1500));
        contactList = await mobileDb.getContacts();
        contact = contactList[payload.senderId];
      }

      if (!contact) throw new Error('Missing keys');

      const senderEncKey = await cryptoService.current.importPublicKey(contact.publicKey, 'ECDH');
      const senderSignKey = await cryptoService.current.importPublicKey(contact.signatureKey, 'ECDSA');

      const isSigned = await cryptoService.current.verify(payload.ciphertext, payload.signature, senderSignKey);
      if (!isSigned) throw new Error('Bad Signature');

      const sessionKey = await cryptoService.current.deriveSessionKey(sessionKeys.encPrivate, senderEncKey);
      const plaintext = await cryptoService.current.decrypt(payload.ciphertext, payload.iv, sessionKey);

      const newMsg = {
        id: payload.id,
        senderId: payload.senderId,
        targetUserId: identity.userId,
        timestamp: payload.timestamp,
        content: plaintext,
        isMe: false,
      };
      const updatedMsgs = await mobileDb.saveMessage(newMsg);
      setMessages(updatedMsgs);

      // Show notification if app is in background or not in this chat
      if (!showChat || activeChat !== payload.senderId) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: contact.nickname || payload.senderId,
            body: plaintext,
            data: { senderId: payload.senderId },
          },
          trigger: null, // immediate
        });
      }
    } catch (err) {
      console.error('Decryption failed', err);
    }
  };

  const sendMessage = async () => {
    if (!activeChat || !inputText || !sessionKeys || !identity || !cryptoService.current) return;
    try {
      const contact = contacts[activeChat];
      if (!contact) return;

      const targetEncKey = await cryptoService.current.importPublicKey(contact.publicKey, 'ECDH');
      const sessionKey = await cryptoService.current.deriveSessionKey(sessionKeys.encPrivate, targetEncKey);
      const { ciphertext, iv } = await cryptoService.current.encrypt(inputText, sessionKey);
      const signature = await cryptoService.current.sign(ciphertext, sessionKeys.signPrivate);

      const messageId = uuidv4();
      const payload: RoutedMessagePayload = {
        id: messageId,
        senderId: identity.userId,
        targetUserId: activeChat,
        timestamp: Date.now(),
        ciphertext,
        iv,
        signature,
      };

      socketRef.current?.send(JSON.stringify({ type: 'ROUTED_MESSAGE', payload }));
      const newMsg = {
        id: messageId,
        senderId: identity.userId,
        targetUserId: activeChat,
        timestamp: payload.timestamp,
        content: inputText,
        isMe: true,
      };
      const updatedMsgs = await mobileDb.saveMessage(newMsg);
      setMessages(updatedMsgs);
      setInputText('');
    } catch (err) {
      console.error('Send failed', err);
      setError('Failed to encrypt/send');
    }
  };

  const handleAddContact = () => {
    if (!targetId.trim()) return;
    socketRef.current?.send(JSON.stringify({ type: 'FETCH_KEY', payload: { targetUserId: targetId.trim() } }));
    setTargetId('');
  };

  const handleReset = () => {
    Alert.alert('Reset Identity', 'Wipe all data and generate NEW identity?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', onPress: async () => {
          await mobileDb.clearAll();
          setIdentity(null);
          setSessionKeys(null);
          setMessages([]);
          setContacts({});
          init();
        } 
      }
    ]);
  };

  if (!showChat) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Shield color="#007bff" size={28} />
          <Text style={styles.title}>Canall</Text>
          <Circle size={10} fill={isConnected ? '#28a745' : '#dc3545'} color="transparent" style={{ marginLeft: 'auto' }} />
        </View>
        <TouchableOpacity style={styles.idBox} onPress={async () => { 
          await Clipboard.setStringAsync(identity?.userId || ''); 
          Alert.alert('Success', 'ID copied to clipboard'); 
        }}>
           <Text style={styles.idText}>My ID: {identity?.userId}</Text>
           <Copy size={14} color="#666" />
        </TouchableOpacity>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.contactBar}>
          <TextInput 
            style={styles.input} 
            placeholder="User ID..." 
            value={targetId}
            onChangeText={setTargetId}
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddContact}>
            <UserPlus color="#fff" size={20} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.chatArea}>
          {Object.values(contacts).map((c) => (
            <TouchableOpacity key={c.userId} style={styles.contactItem} onPress={() => { setActiveChat(c.userId); setShowChat(true); }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactName}>{c.nickname || c.userId}</Text>
                {c.nickname && <Text style={styles.contactId}>{c.userId}</Text>}
              </View>
              <TouchableOpacity onPress={() => mobileDb.deleteContact(c.userId).then(() => mobileDb.getContacts().then(setContacts))}>
                <Trash2 size={18} color="#dc3545" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
          <Text style={{ color: '#666' }}>Reset My Identity</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setShowChat(false)}>
          <ChevronLeft color="#007bff" size={28} />
        </TouchableOpacity>
        <Text style={styles.title}>{contacts[activeChat!]?.nickname || activeChat}</Text>
      </View>

      <ScrollView style={styles.chatArea}>
        {messages.filter(m => m.senderId === activeChat || m.targetUserId === activeChat).map((m, i) => (
          <View key={i} style={[styles.msgBox, m.isMe ? styles.myMsg : styles.theirMsg]}>
            <Text style={{ color: m.isMe ? '#fff' : '#000' }}>{m.content}</Text>
          </View>
        ))}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.inputArea}>
          <TextInput 
            style={styles.msgInput} 
            placeholder="Secure message..." 
            value={inputText}
            onChangeText={setInputText}
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
            <Send color="#fff" size={20} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 20, paddingTop: 50, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  title: { fontSize: 20, fontWeight: 'bold', marginLeft: 10 },
  idBox: { margin: 15, padding: 10, backgroundColor: '#f8f9fa', borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  idText: { fontSize: 12, color: '#666' },
  contactBar: { padding: 15, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, borderBottomWidth: 1, borderBottomColor: '#ccc', marginRight: 10, padding: 8, fontSize: 16 },
  addButton: { backgroundColor: '#007bff', padding: 12, borderRadius: 8 },
  chatArea: { flex: 1, padding: 10 },
  contactItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#f9f9f9', flexDirection: 'row', alignItems: 'center' },
  contactName: { fontWeight: 'bold', fontSize: 16 },
  contactId: { fontSize: 12, color: '#888' },
  inputArea: { padding: 15, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eee' },
  msgInput: { flex: 1, backgroundColor: '#f0f0f0', borderRadius: 25, paddingHorizontal: 20, paddingVertical: 12, marginRight: 10, fontSize: 16 },
  sendButton: { backgroundColor: '#007bff', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  msgBox: { padding: 12, borderRadius: 15, marginVertical: 6, maxWidth: '85%' },
  myMsg: { alignSelf: 'flex-end', backgroundColor: '#007bff' },
  theirMsg: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee' },
  resetBtn: { padding: 20, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eee' },
  errorText: { color: '#dc3545', marginHorizontal: 15, fontSize: 12 }
});
