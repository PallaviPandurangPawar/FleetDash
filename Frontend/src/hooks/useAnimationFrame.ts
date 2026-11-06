// Frontend/src/hooks/useAnimationFrame.ts
// Week 3: requestAnimationFrame loop hook

import { useEffect , useRef } from "react"; 

export function useAnimationFrame(callback : () => void) :void {
    const callbackRef = useRef(callback);


    useEffect(()=>{
        callbackRef.current = callback;
    },[callback]);

    useEffect(()=>{
        let frameId = 0;
        const loop = (): void =>{
             callbackRef.current();
            frameId = requestAnimationFrame(loop);
        };

        frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
    },[])
}