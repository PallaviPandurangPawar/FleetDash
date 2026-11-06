// Frontend/src/components/map/MapCanvas.tsx
// Week 1 (static) -> Week 3 (Canvas + rAF): the live map component
import { useEffect, useRef } from 'react';
import { vehicleBuffer } from '../../canvas/vehicleBuffer';
import type { Viewport } from '../../canvas/projection';
import { drawGrid, drawVehicles } from '../../canvas/renderer';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';

interface Props {
    vehicleCount : number ;
}

const START = {centerLon : 88.3639 , centerLat : 22.5726 , scale : 9000}; // San Francisco

export default function MapCanvas({ vehicleCount }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });

    
        useEffect(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const resize = (): void => {
            const dpr = window.devicePixelRatio || 1;
            const width = canvas.clientWidth;
            const height = canvas.clientHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            sizeRef.current = { width, height, dpr };
            };

            resize();
             const observer = new ResizeObserver(resize);
            observer.observe(canvas);
            return () => observer.disconnect();
        }, []);

         useAnimationFrame(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { width, height, dpr } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const view: Viewport = { ...START, width, height };
    drawGrid(ctx, width, height);
    drawVehicles(ctx, vehicleBuffer.values(), view);
  });


         return (
    <div className="map-area">
      <canvas ref={canvasRef} />
      <div className="map-label">Live map (Canvas) • {vehicleCount} vehicles tracked</div>
    </div>
  );
}