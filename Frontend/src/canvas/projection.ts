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


/** The reverse of project(): canvas x/y back to [lon, lat]. */
export function unproject(x: number, y: number, v: Viewport): [number, number] {
  const k = Math.cos((v.centerLat * Math.PI) / 180);
  const lon = v.centerLon + (x - v.width / 2) / (k * v.scale);
  const lat = v.centerLat - (y - v.height / 2) / v.scale;
  return [lon, lat];
}

/** A viewport that shows all the given [lon, lat] points with some margin around them. */
export function fitViewport(
  points: [number, number][],
  width: number,
  height: number,
  margin = 60
): Viewport | null {
  if (points.length === 0 || width <= 0 || height <= 0) return null;

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of points) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const k = Math.cos((centerLat * Math.PI) / 180);
  const spanX = Math.max(maxLon - minLon, 0.002) * k;
  const spanY = Math.max(maxLat - minLat, 0.002);

  const scale = Math.min(
    Math.max(width - 2 * margin, 50) / spanX,
    Math.max(height - 2 * margin, 50) / spanY,
    20000
  );
  return { centerLon, centerLat, scale, width, height };
}