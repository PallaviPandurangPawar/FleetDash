import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { setWorkerUrl } from 'maplibre-gl';
import type { ErrorEvent, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Geofence } from '../../types/api';
import type { DisplayVehicle } from '../../types/telemetry';

interface Props {
  vehicles: DisplayVehicle[];
  geofences: Geofence[];
}

interface GeofenceProperties {
  id: string;
  name: string;
}

const GEOFENCE_SOURCE = 'fleet-geofences';
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY;

setWorkerUrl(mapWorkerUrl);

function buildVehicleFeatures(vehicles: DisplayVehicle[]): FeatureCollection<Point, { vehicleId: string }> {
  return {
    type: 'FeatureCollection',
    features: vehicles.flatMap((vehicle) => vehicle.location ? [{
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: vehicle.location },
      properties: { vehicleId: vehicle.vehicleId },
    }] : []),
  };
}

function buildGeofenceFeatures(geofences: Geofence[]): FeatureCollection<Polygon, GeofenceProperties> {
  return {
    type: 'FeatureCollection',
    features: geofences.filter((geofence) => geofence.active).map((geofence) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: geofence.polygon.coordinates,
      },
      properties: { id: geofence._id, name: geofence.name },
    })),
  };
}

export default function MapCanvas({ vehicles, geofences }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const vehicleMarkersRef = useRef(new Map<string, maplibregl.Marker>());
  const didFitBounds = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const vehicleData = useMemo(() => buildVehicleFeatures(vehicles), [vehicles]);
  const geofenceData = useMemo(() => buildGeofenceFeatures(geofences), [geofences]);
  const locatedCount = vehicleData.features.length;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!MAPTILER_KEY) {
      setMapError('MapTiler key is missing. Add VITE_MAPTILER_API_KEY to Frontend/.env and restart Vite.');
      return;
    }

    const map = new maplibregl.Map({
      container,
      style: `https://api.maptiler.com/maps/streets-v4/style.json?key=${encodeURIComponent(MAPTILER_KEY)}`,
      center: [88.3639, 22.5726],
      zoom: 11,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');

    const handleLoad = () => {
      setMapError(null);
      setMapReady(true);
    };
    const handleError = (event: ErrorEvent) => {
      console.error('[Fleet map] MapTiler map error:', event.error.message);
      setMapError('Map tiles could not load. Check the MapTiler key, key restrictions, and network connection.');
    };

    map.on('load', handleLoad);
    map.on('error', handleError);

    return () => {
      map.off('load', handleLoad);
      map.off('error', handleError);
      vehicleMarkersRef.current.forEach((marker) => marker.remove());
      vehicleMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;

    const existingGeofenceSource = map.getSource(GEOFENCE_SOURCE) as GeoJSONSource | undefined;
    if (existingGeofenceSource) {
      existingGeofenceSource.setData(geofenceData);
    } else {
      map.addSource(GEOFENCE_SOURCE, { type: 'geojson', data: geofenceData });
      map.addLayer({
        id: 'geofence-fill',
        type: 'fill',
        source: GEOFENCE_SOURCE,
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.14 },
      });
      map.addLayer({
        id: 'geofence-outline',
        type: 'line',
        source: GEOFENCE_SOURCE,
        paint: { 'line-color': '#1d4ed8', 'line-width': 2 },
      });
      map.addLayer({
        id: 'geofence-labels',
        type: 'symbol',
        source: GEOFENCE_SOURCE,
        layout: {
          'symbol-placement': 'point',
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-font': ['Open Sans Semibold'],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#173b7a',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      });
    }

    const visibleIds = new Set<string>();
    vehicles.forEach((vehicle) => {
      if (!vehicle.location) return;
      visibleIds.add(vehicle.vehicleId);

      let marker = vehicleMarkersRef.current.get(vehicle.vehicleId);
      if (!marker) {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'vehicle-marker';
        element.setAttribute('aria-label', `Vehicle ${vehicle.vehicleId}`);
        element.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.1 3.6h9.8c.8 0 1.5.5 1.8 1.2l1.6 4.4v7.1h-2v2.1h-2.2v-2.1H7.9v2.1H5.7v-2.1h-2V9.2l1.6-4.4c.3-.7 1-1.2 1.8-1.2Zm.1 2-1.2 3.1h12l-1.2-3.1H7.2Zm-1.2 5v3.4h12v-3.4H6Zm.7 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm10.6 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/></svg>';
        const popup = new maplibregl.Popup({ closeButton: true, offset: 20 });
        element.addEventListener('click', () => {
          popup.addTo(map);
        });
        marker = new maplibregl.Marker({ element, anchor: 'center', rotationAlignment: 'map' })
          .setLngLat(vehicle.location)
          .setPopup(popup)
          .addTo(map);
        vehicleMarkersRef.current.set(vehicle.vehicleId, marker);
      }

      const element = marker.getElement();
      element.className = `vehicle-marker vehicle-marker--${vehicle.status}`;
      element.title = `${vehicle.vehicleId} · ${Math.round(vehicle.speed)} km/h`;
      element.setAttribute('aria-label', `Vehicle ${vehicle.vehicleId}, ${vehicle.status.replace('_', ' ')}, ${Math.round(vehicle.speed)} kilometres per hour`);
      marker.getPopup()?.setText(`${vehicle.vehicleId} · ${Math.round(vehicle.speed)} km/h · ${vehicle.status.replace('_', ' ')}`);
      marker.setLngLat(vehicle.location).setRotation(vehicle.heading);
      marker.getPopup()?.setLngLat(vehicle.location);
    });

    vehicleMarkersRef.current.forEach((marker, vehicleId) => {
      if (visibleIds.has(vehicleId)) return;
      marker.remove();
      vehicleMarkersRef.current.delete(vehicleId);
    });

    if (!didFitBounds.current && (vehicleData.features.length > 0 || geofenceData.features.length > 0)) {
      const bounds = new maplibregl.LngLatBounds();
      vehicleData.features.forEach((feature) => bounds.extend(feature.geometry.coordinates as [number, number]));
      geofenceData.features.forEach((feature) => {
        feature.geometry.coordinates.forEach((ring) => ring.forEach((coordinate) => bounds.extend(coordinate as [number, number])));
      });
      map.fitBounds(bounds, { padding: 64, maxZoom: 13, duration: 0 });
      didFitBounds.current = true;
    }
  }, [geofenceData, mapReady, vehicleData, vehicles]);

  return (
    <div className="map-area">
      <div ref={containerRef} className="fleet-map" role="application" aria-label={`Interactive fleet map showing ${locatedCount} vehicle locations`} />
      <div className="map-label">
        Live map · {locatedCount} of {vehicles.length} vehicles located
      </div>
      <div className="map-legend" aria-label="Map legend">
        <span><i className="legend-dot in-transit" />In transit</span>
        <span><i className="legend-dot active" />Active</span>
        <span><i className="legend-dot idle" />Idle</span>
        <span><i className="legend-dot offline" />Offline</span>
        <span><i className="legend-zone" />Geofence</span>
      </div>
      {locatedCount === 0 && !mapError && <div className="map-empty">Waiting for vehicle location data</div>}
      {mapError && <div className="map-error" role="alert">{mapError}</div>}
    </div>
  );
}
