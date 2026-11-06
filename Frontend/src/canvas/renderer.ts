// Frontend/src/canvas/renderer.ts
// Draws the geofences and the vehicles on the transparent canvas that lies on top of the real map.
import type { Geofence } from '../types/api';
import type { DisplayVehicle, VehicleStatus } from '../types/telemetry';
import { drawGeofences } from './geofenceLayer';
import type { ToScreen } from './geofenceLayer';

export const STATUS_COLORS: Record<VehicleStatus, string> = {
  in_transit: '#22d3ee',
  active: '#4ade80',
  idle: '#facc15',
  maintenance: '#e879f9',
  offline: '#64748b',
};

const LABEL_MIN_ZOOM = 13; // vehicle ids are shown only from this map zoom level

export interface MapFrame {
  width: number;
  height: number;
  zoom: number;
  toScreen: ToScreen;
}

/** A vehicle that never reported a position sits at [0, 0] and is not drawn. */
export function hasPosition(v: DisplayVehicle): v is DisplayVehicle & { lon: number; lat: number } {
  return v.lon !== undefined && v.lat !== undefined && (Math.abs(v.lon) > 1 || Math.abs(v.lat) > 1);
}

function drawVehicles(ctx: CanvasRenderingContext2D, vehicles: DisplayVehicle[], frame: MapFrame): void {
  ctx.save();
  ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.lineWidth = 1;
  const showLabels = frame.zoom >= LABEL_MIN_ZOOM;

  for (const v of vehicles) {
    if (!hasPosition(v)) continue;

    const [x, y] = frame.toScreen(v.lon, v.lat);
    if (x < -30 || y < -30 || x > frame.width + 30 || y > frame.height + 30) continue;

    const color = STATUS_COLORS[v.status] ?? STATUS_COLORS.offline;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)';

    ctx.beginPath();
    if (v.heading !== undefined) {
      // A live vehicle: an arrow that points where it is driving (0 degrees = north)
      const rad = (v.heading * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dy = -Math.cos(rad);
      ctx.moveTo(x + dx * 10, y + dy * 10);
      ctx.lineTo(x - dx * 6 - dy * 6, y - dy * 6 + dx * 6);
      ctx.lineTo(x - dx * 6 + dy * 6, y - dy * 6 - dx * 6);
      ctx.closePath();
    } else {
      ctx.arc(x, y, 5, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();

    if (v.heading !== undefined) {
      // A faint ring marks the vehicles that are sending live data
      ctx.shadowBlur = 0;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (showLabels) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#a5f3fc';
      ctx.fillText(v.vehicleId, x + 16, y + 4);
    }
  }

  ctx.restore();
}

export function drawMap(
  ctx: CanvasRenderingContext2D,
  frame: MapFrame,
  vehicles: DisplayVehicle[],
  geofences: Geofence[]
): void {
  drawGeofences(ctx, geofences, frame.toScreen);
  drawVehicles(ctx, vehicles, frame);
}