// Frontend/src/components/common/FpsMeter.tsx
// Week 4: FPS meter for proving the 60 FPS goal
import { useRef, useState } from 'react';
import { useAnimationFrame } from '../../hooks/useAnimationFrame';

export default function FpsMeter() {
  const [fps, setFps] = useState(0);
  const frames = useRef(0);
  const windowStart = useRef(0);

  // Count frames, and update the number once per second
  useAnimationFrame((now) => {
    if (windowStart.current === 0) windowStart.current = now;
    frames.current += 1;
    const elapsed = now - windowStart.current;
    if (elapsed >= 1000) {
      setFps(Math.round((frames.current * 1000) / elapsed));
      frames.current = 0;
      windowStart.current = now;
    }
  });

  return <span className={fps >= 55 ? 'fps-meter fps-good' : 'fps-meter fps-low'}>{fps} FPS</span>;
}