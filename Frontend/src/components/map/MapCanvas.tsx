import { useEffect, useRef } from 'react';
import type { Geofence } from '../../types/api';
import type { DisplayVehicle, VehicleStatus } from '../../types/telemetry';

interface Props {
  vehicles: DisplayVehicle[];
  geofences: Geofence[];
}

const markerColors: Record<VehicleStatus, string> = {
  active: '#16a34a',
  in_transit: '#1d4ed8',
  idle: '#f59e0b',
  offline: '#64748b',
  maintenance: '#ef4444',
};

interface Bounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

function getBounds(vehicles: DisplayVehicle[], geofences: Geofence[]): Bounds | null {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let hasCoordinates = false;
  const include = ([longitude, latitude]: [number, number]) => {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
    hasCoordinates = true;
    minLon = Math.min(minLon, longitude);
    maxLon = Math.max(maxLon, longitude);
    minLat = Math.min(minLat, latitude);
    maxLat = Math.max(maxLat, latitude);
  };

  for (const vehicle of vehicles) {
    if (vehicle.location) include(vehicle.location);
  }
  for (const geofence of geofences) {
    for (const ring of geofence.polygon.coordinates) {
      for (const coordinate of ring) include(coordinate);
    }
  }
  if (!hasCoordinates) return null;

  const longitudePadding = Math.max((maxLon - minLon) * 0.12, 0.005);
  const latitudePadding = Math.max((maxLat - minLat) * 0.12, 0.005);

  minLon -= longitudePadding;
  maxLon += longitudePadding;
  minLat -= latitudePadding;
  maxLat += latitudePadding;
  return { minLon, maxLon, minLat, maxLat };
}

export default function MapCanvas({ vehicles, geofences }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: width, clientHeight: height } = canvas;
      if (!width || !height) return;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = '#f6f9ff';
      context.fillRect(0, 0, width, height);

      context.strokeStyle = '#e5edf8';
      context.lineWidth = 1;
      for (let x = 0; x <= width; x += 42) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      for (let y = 0; y <= height; y += 42) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      const bounds = getBounds(vehicles, geofences);
      if (!bounds) return;

      const padding = 34;
      const plotWidth = Math.max(1, width - padding * 2);
      const plotHeight = Math.max(1, height - padding * 2);
      const project = ([longitude, latitude]: [number, number]) => ({
        x: padding + ((longitude - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * plotWidth,
        y: height - padding - ((latitude - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * plotHeight,
      });

      for (const geofence of geofences) {
        context.beginPath();
        geofence.polygon.coordinates.forEach((ring) => {
          ring.forEach((coordinate, index) => {
            const point = project(coordinate);
            if (index === 0) context.moveTo(point.x, point.y);
            else context.lineTo(point.x, point.y);
          });
        });
        context.fillStyle = 'rgba(29, 78, 216, 0.08)';
        context.strokeStyle = 'rgba(29, 78, 216, 0.55)';
        context.lineWidth = 1.5;
        context.fill();
        context.stroke();
        const labelPoint = geofence.polygon.coordinates[0]?.[0];
        if (labelPoint) {
          const point = project(labelPoint);
          context.fillStyle = '#334155';
          context.font = '600 11px system-ui';
          context.fillText(geofence.name, point.x + 5, point.y - 5);
        }
      }

      for (const vehicle of vehicles) {
        if (!vehicle.location) continue;
        const point = project(vehicle.location);
        context.beginPath();
        context.arc(point.x, point.y, 8, 0, Math.PI * 2);
        context.fillStyle = 'rgba(255,255,255,0.94)';
        context.fill();
        context.beginPath();
        context.arc(point.x, point.y, 5, 0, Math.PI * 2);
        context.fillStyle = markerColors[vehicle.status];
        context.fill();
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [vehicles, geofences]);

  const locatedCount = vehicles.filter((vehicle) => vehicle.location).length;

  return (
    <div className="map-area">
      <canvas ref={canvasRef} aria-label={`Fleet map showing ${locatedCount} vehicle locations`} />
      <div className="map-label">
        Live map · {locatedCount} of {vehicles.length} vehicles located
      </div>
      <div className="map-legend" aria-label="Map legend">
        <span><i className="legend-dot in-transit" />In transit</span>
        <span><i className="legend-dot active" />Active</span>
        <span><i className="legend-dot idle" />Idle</span>
        <span><i className="legend-dot offline" />Offline</span>
        <span><i className="legend-zone" />Geofence</span>
      </div>
      {!locatedCount && <div className="map-empty">Waiting for vehicle location data</div>}
    </div>
  );
}
