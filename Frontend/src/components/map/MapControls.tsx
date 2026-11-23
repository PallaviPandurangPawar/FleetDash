// Frontend/src/components/map/MapControls.tsx
// Zoom in, zoom out and "fit everything" buttons on the map.
interface Props {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export default function MapControls({ onZoomIn, onZoomOut, onFit }: Props) {
  return (
    <div className="map-controls">
      <button type="button" className="btn" onClick={onZoomIn} aria-label="Zoom in">
        +
      </button>
      <button type="button" className="btn" onClick={onZoomOut} aria-label="Zoom out">
        -
      </button>
      <button type="button" className="btn" onClick={onFit}>
        Fit
      </button>
    </div>
  );
}