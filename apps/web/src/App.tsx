import React, { useState } from 'react';
import { ChatProvider, useChat } from './components/ChatManager';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/schema';
import { Send, UserPlus, Shield, Circle } from 'lucide-react';

const Sidebar: React.FC = () => {
  const { identity, contacts, setActiveContact, activeContact, addContact, isConnected } = useChat();
  const [newContactId, setNewContactId] = useState('');

  return (
    <div style={{ width: '300px', borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
      <div style={{ padding: '20px', borderBottom: '1px solid #eee' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <Shield size={24} color="#007bff" />
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Canall</h2>
          <Circle size={10} fill={isConnected ? '#28a745' : '#dc3545'} color="none" style={{ marginLeft: 'auto' }} />
        </div>
        <div style={{ fontSize: '0.8rem', color: '#666' }}>ID: {identity?.userId}</div>
      </div>

      <div style={{ padding: '15px' }}>
        <div style={{ display: 'flex', gap: '5px' }}>
          <input 
            placeholder="Add User ID..." 
            value={newContactId}
            onChange={(e) => setNewContactId(e.target.value)}
            style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
          <button 
            onClick={() => { addContact(newContactId); setNewContactId(''); }}
            style={{ padding: '8px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            <UserPlus size={18} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {contacts.map(c => (
          <div 
            key={c.userId}
            onClick={() => setActiveContact(c)}
            style={{ 
              padding: '15px', 
              cursor: 'pointer', 
              backgroundColor: activeContact?.userId === c.userId ? '#e7f3ff' : 'transparent',
              borderBottom: '1px solid #f9f9f9'
            }}
          >
            <div style={{ fontWeight: 'bold' }}>{c.userId}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ChatWindow: React.FC = () => {
  const { activeContact, sendMessage, identity } = useChat();
  const [input, setInput] = useState('');

  const messages = useLiveQuery(
    () => activeContact ? db.messages
      .where('senderId').equals(activeContact.userId)
      .or('targetUserId').equals(activeContact.userId)
      .sortBy('timestamp') : [],
    [activeContact]
  );

  if (!activeContact) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>Select a contact to start chatting securely</div>;
  }

  const handleSend = () => {
    if (input.trim()) {
      sendMessage(input);
      setInput('');
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#f0f2f5' }}>
      <div style={{ padding: '15px 20px', backgroundColor: '#fff', borderBottom: '1px solid #eee', fontWeight: 'bold' }}>
        {activeContact.userId}
      </div>

      <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages?.map((m, i) => (
          <div 
            key={i} 
            style={{ 
              alignSelf: m.senderId === identity?.userId ? 'flex-end' : 'flex-start',
              backgroundColor: m.senderId === identity?.userId ? '#007bff' : '#fff',
              color: m.senderId === identity?.userId ? '#fff' : '#333',
              padding: '10px 15px',
              borderRadius: '18px',
              maxWidth: '70%',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
            }}
          >
            {m.content}
            <div style={{ fontSize: '0.6rem', opacity: 0.7, marginTop: '4px', textAlign: 'right' }}>
              {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '20px', backgroundColor: '#fff', display: 'flex', gap: '10px' }}>
        <input 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type an encrypted message..."
          style={{ flex: 1, padding: '12px', borderRadius: '24px', border: '1px solid #ddd', outline: 'none' }}
        />
        <button 
          onClick={handleSend}
          style={{ width: '45px', height: '45px', borderRadius: '50%', border: 'none', backgroundColor: '#007bff', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ChatProvider>
      <div style={{ display: 'flex', width: '100%', height: '100vh' }}>
        <Sidebar />
        <ChatWindow />
      </div>
    </ChatProvider>
  );
};

export default App;
