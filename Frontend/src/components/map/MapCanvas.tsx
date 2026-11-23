// Frontend/src/components/map/MapCanvas.tsx
// The live map: a MapTiler map with the vehicles and geofences drawn on a canvas on top of it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { config, LngLatBounds, Map as MapTilerMap, MapStyle } from '@maptiler/sdk';
import '@maptiler/sdk/dist/maptiler-sdk.css';
import { drawMap, hasPosition } from '../../canvas/renderer';
import type { Geofence } from '../../types/api';
import type { DisplayVehicle } from '../../types/telemetry';
import MapControls from './MapControls';
import VehicleHud from './VehicleHud';

interface Props {
  vehicles: DisplayVehicle[];
  geofences: Geofence[];
  drawing: boolean; // true while the user is drawing a new geofence
  draft: [number, number][]; // the corners placed so far, as [lon, lat]
  onMapClick: (lon: number, lat: number) => void;
  selectedId: string | null; // the vehicle picked in the list or on the map
  onSelectVehicle: (vehicleId: string | null) => void;
}

const API_KEY = import.meta.env.VITE_MAPTILER_API_KEY;
const CUSTOM_STYLE = import.meta.env.VITE_MAPTILER_STYLE; // the id of a style made in the MapTiler style editor

const KEY_PROBLEM_TEXT =
  'MapTiler rejected the API key. Check the key in Frontend/.env, and that it allows http://localhost:5173';

function formatCoord(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
}

export default function MapCanvas({
  vehicles,
  geofences,
  drawing,
  draft,
  onMapClick,
  selectedId,
  onSelectVehicle,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<MapTilerMap | null>(null);
  const lastPanned = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState({ lat: 20, lng: 0, zoom: 2 });
  const [problem, setProblem] = useState<string | null>(
    API_KEY ? null : 'No MapTiler key. Add VITE_MAPTILER_API_KEY to Frontend/.env, then restart npm run dev.'
  );

  // The newest data, readable from the map's event handlers
  const dataRef = useRef({ vehicles, geofences, draft, selectedId });
  dataRef.current = { vehicles, geofences, draft, selectedId };

  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const selectRef = useRef(onSelectVehicle);
  selectRef.current = onSelectVehicle;

  const placed = vehicles.filter(hasPosition).length;
  const liveCount = vehicles.filter((v) => v.heading !== undefined).length;
  const selected = selectedId ? vehicles.find((v) => v.vehicleId === selectedId) ?? null : null;

  // Draws the vehicles and geofences on the transparent canvas over the map
  const redraw = useCallback(() => {
    const map = mapRef.current;
    const canvas = canvasRef.current;
    if (!map || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    drawMap(
      ctx,
      {
        width,
        height,
        zoom: map.getZoom() + 1, // the same zoom numbers as before (this map's zoom 1 = the old zoom 2)
        time: performance.now(),
        selectedId: dataRef.current.selectedId,
        toScreen: (lon, lat) => {
          const point = map.project([lon, lat]);
          return [point.x, point.y];
        },
      },
      dataRef.current.vehicles,
      dataRef.current.geofences,
      dataRef.current.draft
    );
  }, []);

  // Create the map once
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !API_KEY) return;

    config.apiKey = API_KEY;
    const map = new MapTilerMap({
      container: host,
      style: CUSTOM_STYLE || MapStyle.STREETS.DARK,
      center: [0, 20], // the whole world
      zoom: 1,
      minZoom: 1,
      maxZoom: 19,
    });
    mapRef.current = map;

    // Keep the coordinates bar in step with the map, at most once per frame
    let queued = false;
    const updateView = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const center = map.getCenter();
        setView({ lat: center.lat, lng: center.lng, zoom: map.getZoom() + 1 });
      });
    };

    const onMove = () => {
      redraw();
      updateView();
    };

    map.on('load', () => {
      setReady(true);
      onMove();
    });
    map.on('move', onMove);
    map.on('resize', redraw);

    // A rejected key shows up as a 401 or 403 answer for the map data
    map.on('error', (event: unknown) => {
      const status = (event as { error?: { status?: number } }).error?.status;
      if (status === 401 || status === 403) setProblem(KEY_PROBLEM_TEXT);
    });

    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, [redraw]);

  // Draw again when the data changes or the box is resized
  useEffect(() => {
    redraw();
  }, [vehicles, geofences, draft, selectedId, redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  // Clicks on the map: they place corners while a geofence is being drawn, otherwise they pick a vehicle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    map.getCanvas().style.cursor = drawing ? 'crosshair' : '';
    if (drawing) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();

    const onClick = (e: { point: { x: number; y: number }; lngLat: { lng: number; lat: number } }) => {
      if (drawing) {
        clickRef.current(e.lngLat.lng, e.lngLat.lat);
        return;
      }

      // A click near a vehicle picks it; a click on an empty spot clears the selection
      let nearest: string | null = null;
      let nearestDistance = 16;
      for (const v of dataRef.current.vehicles) {
        if (!hasPosition(v)) continue;
        const point = map.project([v.lon, v.lat]);
        const distance = Math.hypot(point.x - e.point.x, point.y - e.point.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = v.vehicleId;
        }
      }
      selectRef.current(nearest);
    };

    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [drawing, ready]);

  // When a vehicle is picked, move the map to it (once per pick)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!selectedId) {
      lastPanned.current = null;
      return;
    }
    if (lastPanned.current === selectedId) return;

    const vehicle = dataRef.current.vehicles.find((v) => v.vehicleId === selectedId);
    if (!vehicle || !hasPosition(vehicle)) return;

    lastPanned.current = selectedId;
    map.easeTo({ center: [vehicle.lon, vehicle.lat], zoom: Math.max(map.getZoom(), 11) });
  }, [selectedId, ready]);

  // The radar pings need a new frame about 30 times per second while vehicles send live data
  const hasLive = liveCount > 0;
  useEffect(() => {
    if (!hasLive) return;

    let frameId = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= 33) {
        last = now;
        redraw();
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [hasLive, redraw]);

  // Zoom and move so that every vehicle and geofence is visible
  const fit = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const bounds = new LngLatBounds();
    let count = 0;
    for (const v of dataRef.current.vehicles) {
      if (hasPosition(v)) {
        bounds.extend([v.lon, v.lat]);
        count += 1;
      }
    }
    for (const fence of dataRef.current.geofences) {
      for (const [lon, lat] of fence.polygon.coordinates[0] ?? []) {
        bounds.extend([lon, lat]);
        count += 1;
      }
    }
    if (count === 0) return;

    map.fitBounds(bounds, { padding: 80, maxZoom: 14 });
  }, []);

  return (
    <div className="map-area">
      <div ref={hostRef} className="map-host" />
      <canvas ref={canvasRef} className="map-overlay" />
      <div className="map-fx" />
      <div className="map-corner tl" />
      <div className="map-corner tr" />
      <div className="map-corner bl" />
      <div className="map-corner br" />
      <div className="map-label">
        Live map (Canvas) • {vehicles.length} vehicles tracked
        {placed < vehicles.length ? ` (${vehicles.length - placed} without a position yet)` : ''}
      </div>
      {selected && <VehicleHud vehicle={selected} onClose={() => onSelectVehicle(null)} />}
      {problem && <div className="map-message map-message-bad">{problem}</div>}
      {!problem && !ready && <div className="map-message">Loading map...</div>}
      {drawing && (
        <div className="map-hint">
          Click the map to place the corners of the geofence ({draft.length} placed)
        </div>
      )}
      <div className="coords-bar">
        <span>
          <span className="coords-dot" />
          LAT: {formatCoord(view.lat, 'N', 'S')}
        </span>
        <span>
          <span className="coords-dot" />
          LON: {formatCoord(view.lng, 'E', 'W')}
        </span>
        <span>ZOOM: {view.zoom.toFixed(1)}</span>
        <span className="coords-accent">LIVE: {liveCount}</span>
      </div>
      <MapControls
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        onFit={fit}
      />
    </div>
  );
}