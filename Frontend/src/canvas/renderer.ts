// Frontend/src/canvas/renderer.ts
// Draws the geofences and the vehicles on the transparent canvas that lies on top of the real map.
import type { Geofence } from '../types/api';
import type { DisplayVehicle, VehicleStatus } from '../types/telemetry';
import { drawGeofences } from './geofenceLayer';
import type { ToScreen } from './geofenceLayer';

export const STATUS_COLORS: Record<VehicleStatus, string> = {
  in_transit: '#b9f12f',
  active: '#5eead4',
  idle: '#f2f0e9',
  maintenance: '#fbbf24',
  offline: '#94a3b8',
};

const LABEL_MIN_ZOOM = 13; // vehicle ids are shown only from this map zoom level

const PING_MS = 2000; // one radar ping takes about 2 seconds

// A fixed starting point in the ping cycle per vehicle, so the rings do not all flash at the same moment
function pingOffset(vehicleId: string): number {
  let hash = 0;
  for (let i = 0; i < vehicleId.length; i += 1) {
    hash = (hash * 31 + vehicleId.charCodeAt(i)) % PING_MS;
  }
  return hash;
}

export interface MapFrame {
  width: number;
  height: number;
  zoom: number;
  time: number; // milliseconds, drives the radar ping animation
  selectedId: string | null; // the vehicle picked in the list or on the map
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

    if (v.heading !== undefined) {
      // Radar ping for a vehicle that sends live data: a ring grows outward from it and fades, again and again
      const phase = ((frame.time + pingOffset(v.vehicleId)) % PING_MS) / PING_MS; // 0 at the start, 1 at the end
      ctx.shadowBlur = 0;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.8 * (1 - phase);
      ctx.lineWidth = 2 - phase;
      ctx.beginPath();
      ctx.arc(x, y, 8 + phase * 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
    }

    if (v.vehicleId === frame.selectedId) {
      // The picked vehicle gets a steady ring and a name tag, like a target lock
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 17, 0, Math.PI * 2);
      ctx.stroke();

      ctx.shadowBlur = 0;
      const tagWidth = ctx.measureText(v.vehicleId).width + 16;
      ctx.fillStyle = 'rgba(6, 26, 39, 0.95)';
      ctx.fillRect(x + 22, y - 11, tagWidth, 22);
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x + 22, y - 11, tagWidth, 22);
      ctx.fillStyle = color;
      ctx.fillText(v.vehicleId, x + 30, y + 4);
      ctx.lineWidth = 1;
    } else if (showLabels) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#f2f0e9';
      ctx.fillText(v.vehicleId, x + 16, y + 4);
    }
  }

  ctx.restore();
}

/** The geofence being drawn right now: a dashed pink outline with numbered corners. */
function drawDraft(ctx: CanvasRenderingContext2D, points: [number, number][], toScreen: ToScreen): void {
  if (points.length === 0) return;
  const PINK = '#f472b6';

  ctx.save();
  ctx.shadowColor = PINK;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);

  const screen = points.map(([lon, lat]) => toScreen(lon, lat));
  ctx.beginPath();
  screen.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (screen.length >= 3) {
    ctx.closePath();
    ctx.fillStyle = 'rgba(244, 114, 182, 0.12)';
    ctx.fill();
  }
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'left';
  screen.forEach(([x, y], i) => {
    ctx.fillStyle = PINK;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fbcfe8';
    ctx.fillText(String(i + 1), x + 8, y - 8);
  });
  ctx.restore();
}

export function drawMap(
  ctx: CanvasRenderingContext2D,
  frame: MapFrame,
  vehicles: DisplayVehicle[],
  geofences: Geofence[],
  draft: [number, number][] = []
): void {
  drawGeofences(ctx, geofences, frame.toScreen);
  drawVehicles(ctx, vehicles, frame);
  drawDraft(ctx, draft, frame.toScreen);
}

