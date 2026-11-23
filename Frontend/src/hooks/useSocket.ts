// Frontend/src/hooks/useSocket.ts
// Week 2: connect/disconnect lifecycle, connection status

import { useEffect, useState } from 'react';
import { socket } from '../services/socketClient';

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