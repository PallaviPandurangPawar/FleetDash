// Frontend/src/services/socketClient.ts
// Week 2: Socket.io client singleton (binary arraybuffer)

import { io, type Socket } from 'socket.io-client';

export const EVENTS = {
  VEHICLE_BATCH: 'vehicles:binary',
  GEOFENCE_ALERT: 'geofence:alert',
} as const;


export const socket: Socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
  transports: ['websocket'],
  autoConnect: false,
});