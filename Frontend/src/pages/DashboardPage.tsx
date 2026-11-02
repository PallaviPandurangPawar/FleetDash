// Frontend/src/pages/DashboardPage.tsx
// Week 1: main page

import { useState , useEffect, useMemo } from "react";
import { useSocket } from "../hooks/useSocket";
import { useVehicleStream } from "../hooks/useVehicleStream";
import { DisplayVehicle, Vehicle, VehicleUpdate } from "../types/telemetry";
import { getVehicles } from "../services/api";
import { DashboardLayout } from "../components/layout/DashboardLayout";
import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import MapCanvas from "../components/map/MapCanvas";
import { getMockVehicles, stepMock, USE_MOCK } from "../utils/mockData";

export default function DashBoardPage()
{
    const socketconnected = useSocket();
    const socketlive = useVehicleStream();
    const [registered , setRegistered ] = useState<Vehicle[]>([]);     
  const [mockLive, setMockLive] = useState<VehicleUpdate[]>([]);

  const connected = USE_MOCK || socketconnected;
  const mocklive = USE_MOCK ? mockLive : socketlive;

      useEffect(() => 
    {
        if(USE_MOCK){
             setRegistered(getMockVehicles());
      const timer = window.setInterval(() => setMockLive(stepMock()), 500);
      return () => window.clearInterval(timer);
        }
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

        for(const u of mocklive)
        {
            const base = byId.get(u.vehicleId);
            byId.set(u.vehicleId , {
                vehicleId : u.vehicleId,
                plateNumber : base?.plateNumber ?? '',
                driverName: base?.driverName ?? 'Unassigned',
                status: u.speed > 5 ? 'in_transit' : 'idle',
                speed: u.speed,
                fuelLevel: u.fuelLevel,
                live: true,
            });
        }
         return Array.from(byId.values());

    },[registered , mocklive]);

    return (
    <DashboardLayout
      header={
        <Header
          connected={connected}
          vehicleCount={rows.length}
          liveCount={mocklive.length}
        />
      }
      sidebar={<Sidebar vehicles={rows} />}
    >
      <MapCanvas vehicleCount={rows.length} />
    </DashboardLayout>
  );
}