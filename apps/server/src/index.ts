import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import type { 
  WSFrame, 
  RegisterPayload, 
  FetchKeyPayload, 
  RoutedMessagePayload, 
  DeliveryAckPayload 
} from './types.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// --- IN-MEMORY STORAGE (Replace with Redis in production) ---

// Maps userId to their active WebSocket connection
const activeConnections = new Map<string, WebSocket>();

// Maps userId to their public keys
interface UserKeys {
  publicKey: string;
  signatureKey: string;
}
const publicKeys = new Map<string, UserKeys>();

// Maps userId to an array of pending (offline) messages
const offlineInbox = new Map<string, RoutedMessagePayload[]>();

// --- RELAY LOGIC ---

wss.on('connection', (ws) => {
  let currentUserId: string | null = null;

  console.log('New client connected');

  ws.on('message', (data: string) => {
    try {
      const frame: WSFrame = JSON.parse(data.toString());
      
      switch (frame.type) {
        case 'REGISTER':
          handleRegister(ws, frame.payload);
          currentUserId = frame.payload.userId;
          break;
        case 'FETCH_KEY':
          handleFetchKey(ws, frame.payload);
          break;
        case 'ROUTED_MESSAGE':
          handleRoutedMessage(ws, frame.payload);
          break;
        case 'DELIVERY_ACK':
          handleDeliveryAck(ws, frame.payload);
          break;
        default:
          console.warn('Unknown frame type:', frame.type);
      }
    } catch (err) {
      console.error('Failed to parse frame:', err);
    }
  });

  ws.on('close', () => {
    if (currentUserId) {
      activeConnections.delete(currentUserId);
      console.log(`User ${currentUserId} disconnected`);
    }
  });
});

function handleRegister(ws: WebSocket, payload: RegisterPayload) {
  const { userId, publicKey, signatureKey } = payload;
  
  // Register active connection
  activeConnections.set(userId, ws);
  
  // Store public keys
  publicKeys.set(userId, { publicKey, signatureKey });
  
  console.log(`User registered: ${userId}`);

  // Push any pending offline messages
  const pending = offlineInbox.get(userId) || [];
  if (pending.length > 0) {
    console.log(`Pushing ${pending.length} offline messages to ${userId}`);
    pending.forEach(msg => {
      ws.send(JSON.stringify({ type: 'ROUTED_MESSAGE', payload: msg }));
    });
    // We don't delete them yet; we wait for DELIVERY_ACK from the client
  }
}

function handleFetchKey(ws: WebSocket, payload: FetchKeyPayload) {
  const { targetUserId } = payload;
  const keys = publicKeys.get(targetUserId);

  if (keys) {
    ws.send(JSON.stringify({
      type: 'FETCH_KEY_RESPONSE',
      payload: { targetUserId, ...keys }
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'ERROR',
      payload: { message: `User ${targetUserId} not found` }
    }));
  }
}

function handleRoutedMessage(ws: WebSocket, payload: RoutedMessagePayload) {
  const { targetUserId } = payload;
  const targetSocket = activeConnections.get(targetUserId);

  if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
    // User is online, relay immediately
    targetSocket.send(JSON.stringify({ type: 'ROUTED_MESSAGE', payload }));
  } else {
    // User is offline, store in temporary inbox
    console.log(`User ${targetUserId} is offline. Storing message ${payload.id}`);
    const pending = offlineInbox.get(targetUserId) || [];
    pending.push(payload);
    offlineInbox.set(targetUserId, pending);
  }
}

function handleDeliveryAck(ws: WebSocket, payload: DeliveryAckPayload) {
  const { messageId, recipientId } = payload;
  
  // Remove from offline inbox if it was there
  const pending = offlineInbox.get(recipientId) || [];
  const updated = pending.filter(msg => msg.id !== messageId);
  offlineInbox.set(recipientId, updated);

  console.log(`Message ${messageId} delivered to ${recipientId}`);
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Canall Relay Server running on port ${PORT}`);
});
