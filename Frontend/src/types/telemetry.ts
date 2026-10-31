// Frontend/src/types/telemetry.ts
// Week 1: Vehicle, TelemetryReading, GeofenceAlert types (strict)

export interface AlertItem {
    id :string;
    type : 'exit' | 'enter' ;
    vehicleId :string;
    geofenceName : string;
    lon : number;
    lat :number;
    occurredAt : number;
    acknowledged : boolean;
}

// One row in the sidebar: REST vehicle info merged with the live update
export interface DisplayVehicle {
  vehicleId: string;
  plateNumber: string;
  driverName: string;
  status: VehicleStatus;
  speed: number;
  fuelLevel: number;
  live: boolean;
}


export interface VehicleUpdate {
    vehicleId: string;
    lon : number;
    lat : number;
    heading : number;
    timestamp : number;
    speed : number;
    fuellevel : number;
    ignition : boolean;
}


export type VehicleStatus = 
 'offline' |
  'active' |
   'idle' |
'in_transit' |
'maintenance';


export interface Vehicle {
    vehicleId : string;
    plateNumber : string;
    make :string;
    model : string;
    year : number;
    driverName  : string;
    status : VehicleStatus;
    lastKnownLocation : 
    {
        type : 'Point';
        coordinates : [number , number];
    }

    lastTelemetry: {
        speed : number ;
        fuelLevel : number;
        engineTemp : number;
        batteryVoltage : number;
        timestamp : string;
    }

}

export interface GeofenceAlert {
  id: string;
  type: 'exit' | 'enter';
  vehicleId: string;
  geofenceId: string;
  geofenceName: string;
  lon: number;
  lat: number;
  occurredAt: number;
}