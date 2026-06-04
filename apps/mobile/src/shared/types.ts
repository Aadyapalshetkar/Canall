export interface WSFrame {
  type: 'REGISTER' | 'FETCH_KEY' | 'FETCH_KEY_RESPONSE' | 'ROUTED_MESSAGE' | 'DELIVERY_ACK' | 'ERROR';
  payload: any;
}

export interface RegisterPayload {
  userId: string;
  deviceId: string;
  publicKey: string; // ECDH Public
  signatureKey: string; // ECDSA Public
}

export interface FetchKeyPayload {
  targetUserId: string;
}

export interface FetchKeyResponsePayload {
  targetUserId: string;
  publicKey: string;
  signatureKey: string;
}

export interface RoutedMessagePayload {
  id: string;
  senderId: string;
  targetUserId: string;
  timestamp: number;
  ciphertext: string;
  iv: string;
  ephemeralPublicKey?: string; // For initial handshake / PFS
  signature: string;
}

export interface DeliveryAckPayload {
  messageId: string;
  recipientId: string;
}
