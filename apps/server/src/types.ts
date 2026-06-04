export interface WSFrame {
  type: 'REGISTER' | 'FETCH_KEY' | 'ROUTED_MESSAGE' | 'DELIVERY_ACK';
  payload: any;
}

export interface RegisterPayload {
  userId: string;
  deviceId: string;
  publicKey: string;
  signatureKey: string;
}

export interface FetchKeyPayload {
  targetUserId: string;
}

export interface RoutedMessagePayload {
  id: string;
  senderId: string;
  targetUserId: string;
  timestamp: number;
  ciphertext: string;
  iv: string;
  ephemeralPublicKey?: string;
  signature: string;
}

export interface DeliveryAckPayload {
  messageId: string;
  recipientId: string;
}
