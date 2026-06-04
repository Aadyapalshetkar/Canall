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
  ScrollView 
} from 'react-native';
import { Send, UserPlus, Shield } from 'lucide-react-native';
import { CryptoService, WSFrame, RoutedMessagePayload } from 'shared';
import { mobileDb } from './src/db/mobileStorage';
import 'react-native-get-random-values';

export default function App() {
  const [identity, setIdentity] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [targetId, setTargetId] = useState('');
  const [activeChat, setActiveChat] = useState<string | null>(null);
  
  const socketRef = useRef<WebSocket | null>(null);
  const cryptoService = useRef(new CryptoService());

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    let id = await mobileDb.getIdentity();
    if (!id) {
      const userId = `mobile_${Math.random().toString(36).substring(7)}`;
      const { encryptionKeys, signingKeys } = await cryptoService.current.generateIdentityKeys();
      
      const pubEnc = await cryptoService.current.exportPublicKey(encryptionKeys.publicKey);
      const pubSign = await cryptoService.current.exportPublicKey(signingKeys.publicKey);

      id = {
        userId,
        deviceId: 'mobile-device',
        encryptionPublicKey: pubEnc,
        signingPublicKey: pubSign,
        _keys: { encryptionKeys, signingKeys }
      };
      await mobileDb.saveIdentity(id);
    }
    setIdentity(id);
    setMessages(await mobileDb.getMessages());
    connect(id);
  };

  const connect = (id: any) => {
    const ws = new WebSocket('ws://localhost:4000');
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'REGISTER',
        payload: {
          userId: id.userId,
          deviceId: id.deviceId,
          publicKey: id.encryptionPublicKey,
          signatureKey: id.signingPublicKey
        }
      }));
    };

    ws.onmessage = async (e) => {
      const frame: WSFrame = JSON.parse(e.data);
      // E2EE Incoming logic...
    };
  };

  const sendMessage = async () => {
    if (!activeChat || !inputText) return;
    // E2EE Encryption logic...
    setInputText('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Shield color="#007bff" size={28} />
        <Text style={styles.title}>Canall Mobile</Text>
      </View>

      <View style={styles.contactBar}>
        <TextInput 
          style={styles.input} 
          placeholder="Contact User ID" 
          value={targetId}
          onChangeText={setTargetId}
        />
        <TouchableOpacity style={styles.addButton} onPress={() => setActiveChat(targetId)}>
          <UserPlus color="#fff" size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.chatArea}>
        {messages.filter(m => m.senderId === activeChat || m.targetUserId === activeChat).map((m, i) => (
          <View key={i} style={[styles.msgBox, m.isMe ? styles.myMsg : styles.theirMsg]}>
            <Text style={{ color: m.isMe ? '#fff' : '#000' }}>{m.content}</Text>
          </View>
        ))}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inputAreaWrapper}>
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
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { padding: 20, paddingTop: 50, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  title: { fontSize: 20, fontWeight: 'bold', marginLeft: 10 },
  contactBar: { padding: 10, flexDirection: 'row', backgroundColor: '#fff', alignItems: 'center' },
  input: { flex: 1, borderBottomWidth: 1, borderBottomColor: '#ccc', marginRight: 10, padding: 8 },
  addButton: { backgroundColor: '#007bff', padding: 12, borderRadius: 8 },
  chatArea: { flex: 1, padding: 10 },
  inputAreaWrapper: { backgroundColor: '#fff' },
  inputArea: { padding: 15, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#eee' },
  msgInput: { flex: 1, backgroundColor: '#f0f0f0', borderRadius: 25, paddingHorizontal: 20, paddingVertical: 12, marginRight: 10 },
  sendButton: { backgroundColor: '#007bff', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  msgBox: { padding: 12, borderRadius: 15, marginVertical: 6, maxWidth: '80%' },
  myMsg: { alignSelf: 'flex-end', backgroundColor: '#007bff' },
  theirMsg: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderBottomColor: '#eee' }
});
