// Frontend/src/components/map/MapCanvas.tsx
// Week 1 (static) -> Week 3 (Canvas + rAF): the live map component
import { useEffect, useRef } from 'react';

interface Props {
  vehicles: DisplayVehicle[];
  geofences: Geofence[];
  drawing: boolean; // true while the user is drawing a new geofence
  draft: [number, number][]; // the corners placed so far, as [lon, lat]
  onMapClick: (lon: number, lat: number) => void;
}
export default function MapCanvas({ vehicleCount }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
        useEffect(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const draw = () : void => {
                const dpr = window.devicePixelRatio || 1;
                const { clientWidth : w , clientHeight : h } = canvas;
                canvas.width = w * dpr;
                canvas.height = h * dpr;
                ctx.scale(dpr, dpr);
               // ctx.clearRect(0, 0, w, h);

               ctx.fillStyle = '#0b1220';
               ctx.fillRect(0, 0, w, h);

               ctx.strokeStyle = '#1e293b';
                ctx.lineWidth = 1;

                for(let x = 0 ; x < w ;x += 50)
                {
                    ctx.beginPath();
                    ctx.moveTo(x ,0);
                    ctx.lineTo(x ,h);
                    ctx.stroke();
                }
                for (let y = 0; y < h; y += 50) 
                {
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(w, y);
                    ctx.stroke();
                }

            };

            draw();

            const observer = new ResizeObserver(draw);

            observer.observe(canvas);

            return () => observer.disconnect();
        }, [])

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
      {drawing && (
        <div className="map-hint">
          Click the map to place the corners of the geofence ({draft.length} placed)
        </div>
      )}
      <MapControls onZoomIn={() => zoomBy(1)} onZoomOut={() => zoomBy(-1)} onFit={fit} />
    </div>
  );
}