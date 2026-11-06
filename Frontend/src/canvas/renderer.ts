// Frontend/src/canvas/renderer.ts
// Week 3: draw loop, batched drawing per status color, viewport culling

import type { VehicleUpdate } from '../types/telemetry';
import { project, Viewport } from '../canvas/projection';

const COLORS = { idle: '#eab308', moving: '#38bdf8', fast: '#f97316' } as const;

type Bucket = keyof typeof COLORS;

function bucketFor(speed : number) : Bucket {
    if (speed < 5) {
        return 'idle';
    }
    else if(speed > 60){
        return 'fast';
    }
    return 'moving';


}

export function drawGrid(ctx : CanvasRenderingContext2D , w: number , h: number) : void
{
    ctx.fillStyle = '#0b1220'
    ctx.fillRect(0,0,w,h);
    
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x < w; x++) {
        ctx.moveTo(x,0);
        ctx.lineTo(x,h);
    }

    for (let y = 0; y < h; y++) {
        ctx.moveTo(0,y);
        ctx.lineTo(w,y);
        
    }

    ctx.stroke();
}


export function drawVehicles(
    ctx : CanvasRenderingContext2D,
    vehicles: Iterable<VehicleUpdate>,
    view: Viewport
): void {
    const buckets : Record<Bucket, [number, number, number][]> = { idle: [], moving: [], fast: [] };

    for (const v of vehicles) {
    const [x, y] = project(v.lon, v.lat, view);
    // Viewport culling: skip vehicles outside the visible area
    if (x < -10 || x > view.width + 10 || y < -10 || y > view.height + 10) continue;
    buckets[bucketFor(v.speed)].push([x, y, v.heading]);
  }

  for(const key of Object.keys(buckets) as Bucket[]) {
        const items = buckets[key];
        if (items.length === 0) {
            continue;
        }

        ctx.fillStyle = COLORS[key];
        ctx.beginPath();
        for (const [x, y, heading] of items) {
            const a = (heading * Math.PI) / 180;
            const cos = Math.cos(a);
            const sin = Math.sin(a);
            ctx.moveTo(x + cos * 5, y + sin * 5);
            ctx.lineTo(x - sin * 3, y + cos * 3);
            ctx.lineTo(x + sin * 3, y - cos * 3);
            ctx.closePath();
        }

        ctx.fill();
  }
}

