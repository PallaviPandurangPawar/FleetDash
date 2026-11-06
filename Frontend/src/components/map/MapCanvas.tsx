// Frontend/src/components/map/MapCanvas.tsx
// The live map: a real Google map in a cyber style, with the vehicles and geofences drawn on a canvas on top.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CYBER_MAP_STYLE } from '../../canvas/cyberMapStyle';
import { drawMap, hasPosition } from '../../canvas/renderer';
import { loadGoogleMaps } from '../../services/googleMaps';
import type { Geofence } from '../../types/api';
import type { DisplayVehicle } from '../../types/telemetry';
import MapControls from './MapControls';

interface Props {
  vehicles: DisplayVehicle[];
  geofences: Geofence[];
}

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const AUTH_FAILURE_TEXT =
  'Google rejected the API key. Check that billing is on, that the Maps JavaScript API is enabled, and that the key allows http://localhost:5173/*';

export default function MapCanvas({ vehicles, geofences }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlayRef = useRef<google.maps.OverlayView | null>(null);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<string | null>(
    API_KEY ? null : 'No Google Maps key. Add VITE_GOOGLE_MAPS_API_KEY to Frontend/.env, then restart npm run dev.'
  );

  // The newest data, readable from the map's event handlers
  const dataRef = useRef({ vehicles, geofences });
  dataRef.current = { vehicles, geofences };

  const placed = vehicles.filter(hasPosition).length;

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
        toScreen: (lon, lat) => {
          const point = projection.fromLatLngToContainerPixel(new google.maps.LatLng(lat, lon));
          return point ? [point.x, point.y] : [-9999, -9999];
        },
      },
      dataRef.current.vehicles,
      dataRef.current.geofences
    );
  }, []);

  // Create the map once the Google script is loaded
  useEffect(() => {
    if (!API_KEY) return;

    let cancelled = false;

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
          backgroundColor: '#050b14',
          styles: CYBER_MAP_STYLE,
        });

        // An invisible overlay gives us the map projection and tells us when the map moves
        const overlay = new google.maps.OverlayView();
        overlay.onAdd = () => {};
        overlay.onRemove = () => {};
        overlay.draw = () => redraw();
        overlay.setMap(map);

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
      overlayRef.current?.setMap(null);
      overlayRef.current = null;
      mapRef.current = null;
    };
  }, [redraw]);

  // Draw again when the data changes or the box is resized
  useEffect(() => {
    redraw();
  }, [vehicles, geofences, redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

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
      {problem && <div className="map-message map-message-bad">{problem}</div>}
      {!problem && !ready && <div className="map-message">Loading map...</div>}
      <MapControls onZoomIn={() => zoomBy(1)} onZoomOut={() => zoomBy(-1)} onFit={fit} />
    </div>
  );
}