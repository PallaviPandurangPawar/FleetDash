// Frontend/src/hooks/useVehicleStream.ts
// Week 2: receive high-frequency arrays WITHOUT React state (write into refs/buffer)

import { useEffect, useRef ,useState } from 'react';
import type { VehicleUpdate } from '../types/telemetry';
import { vehicleBuffer } from '../canvas/vehicleBuffer';
import { decodeBatch  } from '../utils/binaryDecoder';
import { EVENTS, socket } from '../services/socketClient';


const SNAPSHOT_MS = 500; // 500ms snapshot interval

export function useVehicleStream(): VehicleUpdate[] {
    const [snapshot, setSnapshot] = useState<VehicleUpdate[]>([]);
    const dirty = useRef(false);


    useEffect(() => {
        const onBatch = (data: ArrayBuffer): void => {
            try
            {
                for (const update of decodeBatch(data)) 
                {
                    vehicleBuffer.set(update.vehicleId, update);
                }
                dirty.current = true;
            }
            catch (error)
            {
                console.error('Error decoding batch:', error);
            }
        };


        socket.on(EVENTS.VEHICLE_BATCH, onBatch);

        const timer = window.setInterval(() => 
        {
            if (!dirty.current) return;
            dirty.current = false;
            setSnapshot(Array.from(vehicleBuffer.values()));
        }, SNAPSHOT_MS);

            return () => {
            socket.off(EVENTS.VEHICLE_BATCH, onBatch);
            window.clearInterval(timer);
            };
        }, []);

        return snapshot;
}
