import { useEffect, useRef } from 'react';

interface Props {
  vehicleCount: number;
}

const routePixels: Array<[number, number]> = [
  [0.12, 0.18],
  [0.22, 0.26],
  [0.32, 0.46],
  [0.42, 0.41],
  [0.56, 0.47],
  [0.67, 0.6],
  [0.8, 0.67],
  [0.91, 0.48],
];

export default function MapCanvas({ vehicleCount }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: width, clientHeight: height } = canvas;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#f6f9ff';
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = '#dfeaf8';
      ctx.lineWidth = 1;

      for (let x = 0; x <= width; x += 42) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      for (let y = 0; y <= height; y += 42) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      const route = routePixels.map(([xRatio, yRatio]) => ({
        x: xRatio * width,
        y: yRatio * height,
      }));

      ctx.beginPath();
      route.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
          return;
        }
        ctx.lineTo(point.x, point.y);
      });
      ctx.strokeStyle = '#5b86ff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(width * 0.22, height * 0.52, 88, 0, Math.PI * 2);
      ctx.strokeStyle = '#d6dffb';
      ctx.lineWidth = 2;
      ctx.stroke();

      const markerCount = Math.min(16, Math.max(6, vehicleCount));
      for (let index = 0; index < markerCount; index += 1) {
        const x = (index / markerCount) * width * 0.85 + width * 0.09;
        const y = (Math.sin(index * 1.2) * 0.5 + 0.5) * height * 0.7 + height * 0.12;

        ctx.beginPath();
        ctx.fillStyle = index % 3 === 0 ? '#22c55e' : index % 3 === 1 ? '#f59e0b' : '#1d4ed8';
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#0f172a';
      ctx.font = '600 12px system-ui';
      ctx.fillText('North Hub', width * 0.7, height * 0.3);
      ctx.fillText('Depot 6', width * 0.58, height * 0.72);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [vehicleCount]);

  return (
    <div className="map-area">
      <canvas ref={canvasRef} />
      <div className="map-label">Live map · {vehicleCount} vehicles tracked</div>
      <div className="map-actions">
        <span>All</span>
        <span>Movement</span>
        <span>Geo</span>
      </div>
    </div>
  );
}
