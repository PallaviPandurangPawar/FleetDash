// Frontend/src/hooks/useAnimationFrame.ts
// Week 3: requestAnimationFrame loop hook
import {useEffect , useRef} from 'react'; 

export function useAnimationFrame(callback: (now: number) => void): void {
    const callbackRef = useRef(callback);
    callbackRef.current = callback;

    useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

    useEffect(() => {
        let frameId: 0 | number = 0;
        const loop = (now: number) => {
             callbackRef.current(now);
      frameId = requestAnimationFrame(loop);
        };
        frameId = requestAnimationFrame(loop);

        return () => cancelAnimationFrame(frameId);
    }, []);
    }