// Frontend/src/components/map/MapCanvas.tsx
// The live map: a real Google map in a midnight teal style, with the vehicles and geofences drawn on a canvas on top.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CYBER_MAP_STYLE } from '../../canvas/cyberMapStyle';
import { drawMap, hasPosition } from '../../canvas/renderer';
import { loadGoogleMaps } from '../../services/googleMaps';
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

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const AUTH_FAILURE_TEXT =
  'Google rejected the API key. Check that billing is on, that the Maps JavaScript API is enabled, and that the key allows http://localhost:5173/*';

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
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlayRef = useRef<google.maps.OverlayView | null>(null);
  const lastPanned = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState({ lat: 20, lng: 0, zoom: 2 });
  const [problem, setProblem] = useState<string | null>(
    API_KEY ? null : 'No Google Maps key. Add VITE_GOOGLE_MAPS_API_KEY to Frontend/.env, then restart npm run dev.'
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
    const overlay = overlayRef.current;
    const canvas = canvasRef.current;
    if (!map || !overlay || !canvas) return;

    const projection = overlay.getProjection();
    if (!projection) return;
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
        zoom: map.getZoom() ?? 2,
        time: performance.now(),
        selectedId: dataRef.current.selectedId,
        toScreen: (lon, lat) => {
          const point = projection.fromLatLngToContainerPixel(new google.maps.LatLng(lat, lon));
          return point ? [point.x, point.y] : [-9999, -9999];
        },
      },
      dataRef.current.vehicles,
      dataRef.current.geofences,
      dataRef.current.draft
    );
  }, []);

  // Create the map once the Google script is loaded
  useEffect(() => {
    if (!API_KEY) return;

    let cancelled = false;
    const listeners: google.maps.MapsEventListener[] = [];

    // Google calls this when it rejects the key (wrong key, billing off, website not allowed, ...)
    (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () =>
      setProblem(AUTH_FAILURE_TEXT);

    loadGoogleMaps(API_KEY)
      .then(() => {
        const host = hostRef.current;
        if (cancelled || !host) return;

        const map = new google.maps.Map(host, {
          center: { lat: 20, lng: 0 }, // the whole world
          zoom: 2,
          minZoom: 2,
          maxZoom: 20,
          disableDefaultUI: true,
          gestureHandling: 'greedy', // the mouse wheel zooms directly
          clickableIcons: false,
          backgroundColor: '#061a27',
          styles: CYBER_MAP_STYLE,
        });

        // An invisible overlay gives us the map projection and tells us when the map moves
        const overlay = new google.maps.OverlayView();
        overlay.onAdd = () => {};
        overlay.onRemove = () => {};
        overlay.draw = () => redraw();
        overlay.setMap(map);

        // Keep the coordinates bar in step with the map, at most once per frame
        let queued = false;
        const updateView = () => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(() => {
            queued = false;
            const center = map.getCenter();
            if (center) setView({ lat: center.lat(), lng: center.lng(), zoom: map.getZoom() ?? 2 });
          });
        };
        listeners.push(map.addListener('center_changed', updateView));
        listeners.push(map.addListener('zoom_changed', updateView));

        mapRef.current = map;
        overlayRef.current = overlay;
        setReady(true);
        redraw();
      })
      .catch((err: Error) => {
        if (!cancelled) setProblem(err.message);
      });

    return () => {
      cancelled = true;
      listeners.forEach((listener) => listener.remove());
      overlayRef.current?.setMap(null);
      overlayRef.current = null;
      mapRef.current = null;
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
    const overlay = overlayRef.current;
    if (!map || !overlay || !ready) return;

    map.setOptions({ draggableCursor: drawing ? 'crosshair' : null, disableDoubleClickZoom: drawing });

    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;

      if (drawing) {
        clickRef.current(e.latLng.lng(), e.latLng.lat());
        return;
      }

      const projection = overlay.getProjection();
      const click = projection?.fromLatLngToContainerPixel(e.latLng);
      if (!projection || !click) return;

      // A click near a vehicle picks it; a click on an empty spot clears the selection
      let nearest: string | null = null;
      let nearestDistance = 16;
      for (const v of dataRef.current.vehicles) {
        if (!hasPosition(v)) continue;
        const point = projection.fromLatLngToContainerPixel(new google.maps.LatLng(v.lat, v.lon));
        if (!point) continue;
        const distance = Math.hypot(point.x - click.x, point.y - click.y);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = v.vehicleId;
        }
      }
      selectRef.current(nearest);
    });

    return () => listener.remove();
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
    map.panTo({ lat: vehicle.lat, lng: vehicle.lon });
    if ((map.getZoom() ?? 0) < 11) map.setZoom(12);
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

    const bounds = new google.maps.LatLngBounds();
    let count = 0;
    for (const v of dataRef.current.vehicles) {
      if (hasPosition(v)) {
        bounds.extend({ lat: v.lat, lng: v.lon });
        count += 1;
      }
    }
    for (const fence of dataRef.current.geofences) {
      for (const [lon, lat] of fence.polygon.coordinates[0] ?? []) {
        bounds.extend({ lat, lng: lon });
        count += 1;
      }
    }
    if (count === 0) return;

    map.fitBounds(bounds, 80);
    // A single vehicle would zoom in too far
    google.maps.event.addListenerOnce(map, 'idle', () => {
      if ((map.getZoom() ?? 0) > 15) map.setZoom(15);
    });
  }, []);

  const zoomBy = (step: number) => {
    const map = mapRef.current;
    if (map) map.setZoom((map.getZoom() ?? 2) + step);
  };

  return (
    <div className="map-area">
      <canvas ref={canvasRef} className={drawing ? 'is-drawing' : undefined} />
      <div className="map-label">
        Live map (Canvas) • {vehicles.length} vehicles tracked
        <br />
        <small>Drag to pan • scroll to zoom • double-click to reset</small>
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
        <span>ZOOM: {view.zoom}</span>
        <span className="coords-accent">LIVE: {liveCount}</span>
      </div>
      <MapControls onZoomIn={() => zoomBy(1)} onZoomOut={() => zoomBy(-1)} onFit={fit} />
    </div>
  );
}