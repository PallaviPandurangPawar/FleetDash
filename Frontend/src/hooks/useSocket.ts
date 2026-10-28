// Frontend/src/hooks/useSocket.ts
// Week 2: connect/disconnect lifecycle, connection status

import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

export const EVENTS = {
  VEHICLE_BATCH: 'vehicles:binary',
  GEOFENCE_ALERT: 'geofence:alert',
} as const;

//const socket: Socket = io({ autoConnect: false });
export const socket: Socket = io(import.meta.env.VITE_SOCKET_URL, {
  transports: ['websocket'],
  autoConnect: false,
});

export function useSocket(): boolean 
{
    const [connected , setConnected] = useState<boolean>(socket.connected);

    useEffect(() => {
        const onConnect = (): void => setConnected(true);
        const onDisconnect = (): void => setConnected(false);

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);

        socket.connect();


        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.disconnect();
        } ;
    }, []);

    return connected;

} 