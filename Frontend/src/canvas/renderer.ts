// Frontend/src/canvas/renderer.ts
// Week 3: draw loop, batched drawing per status color, viewport culling
import type { Geofence } from '../types/api';
import type { VehicleUpdate } from '../types/telemetry';
import { project, type Viewport } from './projection';

const COLORS = { idle: '#eab308', moving: '#38bdf8', fast: '#f97316' } as const;
type Bucket = keyof typeof COLORS;

function bucketFor(speed: number): Bucket {
  if (speed < 5) return 'idle';
  if (speed > 60) return 'fast';
  return 'moving';
}

// Grid moves with the map, so panning and zooming feel real
export function drawGrid(ctx: CanvasRenderingContext2D, view: Viewport): void {
  const { width: w, height: h } = view;
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, w, h);

  const [ox, oy] = project(0, 0, view);
  const step = 50;
  const startX = ((ox % step) + step) % step;
  const startY = ((oy % step) + step) % step;

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = startX; x < w; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = startY; y < h; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
}

// Adds the corners of a polygon ring ([lon, lat] pairs) to the current path
function tracePolygon(ctx: CanvasRenderingContext2D, ring: number[][], view: Viewport): boolean {
  let started = false;
  for (const p of ring) {
    const lon = p[0];
    const lat = p[1];
    if (lon === undefined || lat === undefined) continue;
    const [x, y] = project(lon, lat, view);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  return started;
}

export function drawGeofences(
  ctx: CanvasRenderingContext2D,
  geofences: Geofence[],
  view: Viewport
): void {
  for (const g of geofences) {
    const ring = g.polygon?.coordinates?.[0];
    if (!ring || ring.length < 3) continue;

    ctx.beginPath();
    if (!tracePolygon(ctx, ring, view)) continue;
    ctx.closePath();

    ctx.fillStyle = 'rgba(34, 197, 94, 0.12)';
    ctx.fill();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Name next to the first corner
    const first = ring[0];
    const lon = first?.[0];
    const lat = first?.[1];
    if (lon !== undefined && lat !== undefined) {
      const [x, y] = project(lon, lat, view);
      ctx.fillStyle = '#86efac';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(g.name, x + 6, y - 6);
    }
  }
}

// The corners placed so far while the user draws a new geofence
export function drawDraft(
  ctx: CanvasRenderingContext2D,
  draft: [number, number][],
  view: Viewport
): void {
  if (draft.length === 0) return;

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  draft.forEach(([lon, lat], i) => {
    const [x, y] = project(lon, lat, view);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#38bdf8';
  for (const [lon, lat] of draft) {
    const [x, y] = project(lon, lat, view);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawVehicles(
  ctx: CanvasRenderingContext2D,
  vehicles: Iterable<VehicleUpdate>,
  view: Viewport
): void {
  // Step 1: project each vehicle and sort it into a colour bucket
  const buckets: Record<Bucket, [number, number, number][]> = { idle: [], moving: [], fast: [] };

  for (const v of vehicles) {
    const [x, y] = project(v.lon, v.lat, view);
    // Viewport culling: skip vehicles outside the visible area
    if (x < -10 || x > view.width + 10 || y < -10 || y > view.height + 10) continue;
    buckets[bucketFor(v.speed)].push([x, y, v.heading]);
  }

  // Step 2: one path and one fill() per colour (batched drawing)
  for (const key of Object.keys(buckets) as Bucket[]) {
    const items = buckets[key];
    if (items.length === 0) continue;

    ctx.fillStyle = COLORS[key];
    ctx.beginPath();
    for (const [x, y, heading] of items) {
      const a = (heading * Math.PI) / 180;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      // Triangle pointing along the heading (0 degrees = north, 90 = east)
      ctx.moveTo(x + 7 * sin, y - 7 * cos);
      ctx.lineTo(x + 5 * cos - 6 * sin, y + 5 * sin + 6 * cos);
      ctx.lineTo(x - 5 * cos - 6 * sin, y - 5 * sin + 6 * cos);
      ctx.closePath();
    }
    ctx.fill();
  }
}