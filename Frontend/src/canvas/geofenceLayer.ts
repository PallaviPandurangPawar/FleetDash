// Frontend/src/canvas/geofenceLayer.ts
// Draws the geofence polygons (glowing dashed outline, faint fill and name) on the canvas over the map.
import type { Geofence } from '../types/api';

/** Turns a position into canvas x/y. The map supplies it, so everything lines up with the real map. */
export type ToScreen = (lon: number, lat: number) => [number, number];

const NEON = '#22d3ee';

export function drawGeofences(
  ctx: CanvasRenderingContext2D,
  geofences: Geofence[],
  toScreen: ToScreen
): void {
  ctx.save();
  ctx.font = '12px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';

  for (const fence of geofences) {
    const ring = fence.polygon.coordinates[0];
    if (!ring || ring.length < 3) continue;

    ctx.beginPath();
    let sumX = 0;
    let sumY = 0;
    ring.forEach(([lon, lat], i) => {
      const [x, y] = toScreen(lon, lat);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      sumX += x;
      sumY += y;
    });
    ctx.closePath();

    ctx.shadowColor = NEON;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.fillStyle = 'rgba(34, 211, 238, 0.08)';
    ctx.strokeStyle = NEON;
    ctx.fill();
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#a5f3fc';
    ctx.fillText(fence.name.toUpperCase(), sumX / ring.length, sumY / ring.length);
  }

  ctx.restore();
}