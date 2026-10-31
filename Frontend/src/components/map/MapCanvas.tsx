// Frontend/src/components/map/MapCanvas.tsx
// Week 1 (static) -> Week 3 (Canvas + rAF): the live map component
import { useEffect, useRef } from 'react';

interface Props {
    vehicleCount : number ;
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
      <canvas ref={canvasRef} />
      <div className="map-label">Live map (Canvas) • {vehicleCount} vehicles tracked</div>
    </div>
  );
}