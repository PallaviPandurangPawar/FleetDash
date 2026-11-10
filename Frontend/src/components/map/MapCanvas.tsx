// Frontend/src/components/map/MapCanvas.tsx
// Week 3: live Canvas map with vehicles, geofences, pan, zoom and geofence drawing
import { useEffect, useRef } from 'react';
import { vehicleBuffer } from '../../canvas/vehicleBuffer';
import type { Viewport } from '../../canvas/projection';
import { drawDraft, drawGeofences, drawGrid, drawVehicles } from '../../canvas/renderer';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';
import type { Geofence } from '../../types/api';
import type { DisplayVehicle } from '../../types/telemetry';

interface Props {
  vehicles: DisplayVehicle[];
  geofences: Geofence[];
  drawing: boolean; // true while the user is drawing a new geofence
  draft: [number, number][]; // the corners placed so far, as [lon, lat]
  onMapClick: (lon: number, lat: number) => void;
}

// Kolkata, the same centre the simulator and the mock data use
const START = { centerLon: 88.3639, centerLat: 22.5726, scale: 9000 };
const MIN_SCALE = 1500;
const MAX_SCALE = 200000;

// Screen position (pixels) -> map position (lon, lat)
function unproject(x: number, y: number, v: Viewport): [number, number] {
  const k = Math.cos((v.centerLat * Math.PI) / 180);
  return [v.centerLon + (x - v.width / 2) / (k * v.scale), v.centerLat - (y - v.height / 2) / v.scale];
}

export default function MapCanvas({ vehicles, geofences, drawing, draft, onMapClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  // Pan/zoom state lives in a ref: changing it never re-renders React
  const viewRef = useRef({ ...START });
  // Latest props for the event handlers below (which are set up once)
  const liveProps = useRef({ drawing, onMapClick });
  liveProps.current = { drawing, onMapClick };

  // Keep the canvas pixel size in sync with its CSS size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

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

  // Pan (drag), zoom (wheel), reset (double-click) and click-to-place-corner
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let moved = 0;

    const onDown = (e: PointerEvent): void => {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent): void => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      const v = viewRef.current;
      const k = Math.cos((v.centerLat * Math.PI) / 180);
      v.centerLon -= dx / (k * v.scale);
      v.centerLat += dy / v.scale;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      // A press that barely moved is a click, not a pan
      if (moved < 4 && liveProps.current.drawing) {
        const rect = canvas.getBoundingClientRect();
        const { width, height } = sizeRef.current;
        const view: Viewport = { ...viewRef.current, width, height };
        const [lon, lat] = unproject(e.clientX - rect.left, e.clientY - rect.top, view);
        liveProps.current.onMapClick(lon, lat);
      }
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const v = viewRef.current;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      v.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
    };
    const onReset = (): void => {
      viewRef.current = { ...START };
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onReset);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onReset);
    };
  }, []);

  const zoomBy = (direction: 1 | -1): void => {
    const v = viewRef.current;
    const factor = direction > 0 ? 1.4 : 1 / 1.4;
    v.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
  };
  const resetView = (): void => {
    viewRef.current = { ...START };
  };

  // Runs every frame: grid, geofences, the draft polygon, then every vehicle
  useAnimationFrame(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { width, height, dpr } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const view: Viewport = { ...viewRef.current, width, height };
    drawGrid(ctx, view);
    drawGeofences(ctx, geofences, view);
    drawDraft(ctx, draft, view);
    drawVehicles(ctx, vehicleBuffer.values(), view);
  });

  return (
    <div className="map-area">
      <canvas ref={canvasRef} className={drawing ? 'is-drawing' : undefined} />
      <div className="map-label">
        Live map (Canvas) • {vehicles.length} vehicles tracked
        <br />
        <small>Drag to pan • scroll to zoom • double-click to reset</small>
      </div>
      {drawing && (
        <div className="map-hint">
          Click the map to place the corners of the geofence ({draft.length} placed)
        </div>
      )}
      <div className="map-zoom">
        <button type="button" onClick={() => zoomBy(1)} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomBy(-1)} aria-label="Zoom out">&minus;</button>
        <button type="button" onClick={resetView} aria-label="Reset view">Reset</button>
      </div>
    </div>
  );
}