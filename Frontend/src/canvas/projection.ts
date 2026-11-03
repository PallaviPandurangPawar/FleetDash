// Frontend/src/canvas/projection.ts
// Week 3: lon/lat -> canvas x/y (Web Mercator), pan/zoom transform
export interface Viewport {
  centerLon: number;
  centerLat: number;
  scale: number; // pixels per degree of latitude
  width: number;
  height: number;
}

export function project(lon: number, lat: number, v: Viewport): [number, number] 
{
  const k = Math.cos((v.centerLat * Math.PI) / 180);
  const x = v.width / 2 + (lon - v.centerLon) * k * v.scale;
  const y = v.height / 2 - (lat - v.centerLat) * v.scale;
  return [x, y];
}