import React, { useState, useEffect } from 'react';
import { ChatProvider, useChat } from './components/ChatManager';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/schema';
import { Send, UserPlus, Shield, Circle, ChevronLeft, Trash2, Copy, Check, Edit2 } from 'lucide-react';

const Sidebar: React.FC<{ onSelect: () => void }> = ({ onSelect }) => {
  const { identity, contacts, setActiveContact, activeContact, addContact, deleteContact, renameContact, resetIdentity, isConnected, error } = useChat();
  const [newContactId, setNewContactId] = useState('');
  const [copied, setCopied] = useState(false);

  const copyId = () => {
    if (identity) {
      navigator.clipboard.writeText(identity.userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRename = (userId: string, currentName: string) => {
    const newName = prompt('Enter a new name for this user:', currentName || userId);
    if (newName) renameContact(userId, newName);
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
      <div style={{ padding: '20px', borderBottom: '1px solid #eee' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <Shield size={24} color="#007bff" />
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Canall</h2>
          <Circle size={10} fill={isConnected ? '#28a745' : '#dc3545'} color="none" style={{ marginLeft: 'auto' }} />
        </div>
        <div 
          onClick={copyId}
          style={{ fontSize: '0.8rem', color: '#666', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', backgroundColor: '#f8f9fa', padding: '5px 8px', borderRadius: '4px' }}
        >
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>ID: {identity?.userId}</span>
          {copied ? <Check size={14} color="#28a745" /> : <Copy size={14} />}
        </div>
      </div>

      <div style={{ padding: '15px' }}>
        <div style={{ display: 'flex', gap: '5px' }}>
          <input 
            placeholder="Add User ID..." 
            value={newContactId}
            onChange={(e) => setNewContactId(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                addContact(newContactId);
                setNewContactId('');
              }
            }}
            style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '16px' }}
          />
          <button 
            onClick={() => { addContact(newContactId); setNewContactId(''); }}
            style={{ padding: '8px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            <UserPlus size={18} />
          </button>
        </div>
        {error && <div style={{ color: '#dc3545', fontSize: '0.75rem', marginTop: '8px' }}>{error}</div>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {contacts.map(c => (
          <div 
            key={c.userId}
            onClick={() => { setActiveContact(c); onSelect(); }}
            style={{ 
              padding: '15px', 
              cursor: 'pointer', 
              backgroundColor: activeContact?.userId === c.userId ? '#e7f3ff' : 'transparent',
              borderBottom: '1px solid #f9f9f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nickname || c.userId}</div>
              {c.nickname && <div style={{ fontSize: '0.7rem', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.userId}</div>}
            </div>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button 
                onClick={(e) => { e.stopPropagation(); handleRename(c.userId, c.nickname || ''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px' }}
              >
                <Edit2 size={16} color="#666" />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteContact(c.userId); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px' }}
              >
                <Trash2 size={16} color="#dc3545" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '15px', borderTop: '1px solid #eee' }}>
        <button 
          onClick={() => { if(confirm('Wipe all data and generate NEW identity?')) resetIdentity(); }}
          style={{ width: '100%', padding: '10px', backgroundColor: '#f8f9fa', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', color: '#666' }}
        >
          Reset My Identity
        </button>
      </div>
    </div>
  );
};

const ChatWindow: React.FC<{ onBack: () => void, isMobile: boolean }> = ({ onBack, isMobile }) => {
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
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', padding: '20px', textAlign: 'center' }}>Select a contact to start chatting securely</div>;
  }

  const handleSend = () => {
    if (input.trim()) {
      sendMessage(input);
      setInput('');
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#f0f2f5', height: '100%' }}>
      <div style={{ padding: '10px 15px', backgroundColor: '#fff', borderBottom: '1px solid #eee', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
        {isMobile && (
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px' }}>
            <ChevronLeft size={24} color="#007bff" />
          </button>
        )}
        <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeContact.nickname || activeContact.userId}</div>
      </div>

      <div style={{ flex: 1, padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages?.map((m, i) => (
          <div 
            key={i} 
            style={{ 
              alignSelf: m.senderId === identity?.userId ? 'flex-end' : 'flex-start',
              backgroundColor: m.senderId === identity?.userId ? '#007bff' : '#fff',
              color: m.senderId === identity?.userId ? '#fff' : '#333',
              padding: '10px 15px',
              borderRadius: '18px',
              maxWidth: '85%',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              wordBreak: 'break-word'
            }}
          >
            {m.content}
            <div style={{ fontSize: '0.6rem', opacity: 0.7, marginTop: '4px', textAlign: 'right' }}>
              {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '10px 15px', backgroundColor: '#fff', display: 'flex', gap: '10px', alignItems: 'center', paddingBottom: '15px' }}>
        <input 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Secure message..."
          style={{ flex: 1, padding: '10px 15px', borderRadius: '24px', border: '1px solid #ddd', outline: 'none', fontSize: '16px' }}
        />
        <button 
          onClick={handleSend}
          style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', backgroundColor: '#007bff', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <ChatProvider>
      <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
        {(!isMobile || !showChat) && (
          <div style={{ width: isMobile ? '100%' : '300px', borderRight: '1px solid #ddd', height: '100%' }}>
            <Sidebar onSelect={() => isMobile && setShowChat(true)} />
          </div>
        )}
        {(!isMobile || showChat) && (
          <ChatWindow onBack={() => setShowChat(false)} isMobile={isMobile} />
        )}
      </div>
    </ChatProvider>
  );
};

export default App;
