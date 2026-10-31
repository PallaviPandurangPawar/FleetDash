// Frontend/src/pages/DashboardPage.tsx
// Week 1: main page

import { useState , useEffect, useMemo } from "react";
import { useSocket } from "../hooks/useSocket";
import { useVehicleStream } from "../hooks/useVehicleStream";
import { DisplayVehicle, Vehicle } from "../types/telemetry";
import { getVehicles } from "../services/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import MapCanvas from "../components/map/MapCanvas";

export default function DashBoardPage()
{
    const connected = useSocket();
    const live = useVehicleStream();
    const [registered , setRegistered ] = useState<Vehicle[]>([]);

      useEffect(() => 
    {
        getVehicles()
      .then((res: { vehicles: Vehicle[] }) => setRegistered(res.vehicles))
      .catch((err : Error) => console.error('Could not load vehicles:', err));
    }, []);

    const rows = useMemo<DisplayVehicle[]>(()=>
    {
        const byId = new Map<string , DisplayVehicle>();
        for(const v of registered)
        {
            byId.set(v.vehicleId , 
                {
                    vehicleId : v.vehicleId,
                    plateNumber : v.plateNumber,
                    driverName : v.driverName,
                    status : v.status,
                    speed : v.lastTelemetry?.speed ?? 0,
                    fuelLevel : v.lastTelemetry?.fuelLevel ?? 0,
                    live : false
                });
        }

        for(const u of live)
        {
            const base = byId.get(u.vehicleId);
            byId.set(u.vehicleId , {
                vehicleId : u.vehicleId,
                plateNumber : base?.plateNumber ?? '',
                driverName: base?.driverName ?? 'Unassigned',
                status: u.speed > 5 ? 'in_transit' : 'idle',
                speed: u.speed,
                fuelLevel: u.fuellevel,
                live: true,
            });
        }
         return Array.from(byId.values());

    },[registered , live]);

    return (
    <DashboardLayout
      header={
        <Header
          connected={connected}
          vehicleCount={rows.length}
          liveCount={live.length}
        />
      }
      sidebar={<Sidebar vehicles={rows} />}
    >
      <MapCanvas vehicleCount={rows.length} />
    </DashboardLayout>
  );
}