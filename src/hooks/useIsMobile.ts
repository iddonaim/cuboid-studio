import { useState, useEffect } from 'react';

export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
};

/** Detects touch-capable devices (phones, tablets, touch laptops). */
export const useIsTouch = (): boolean => {
  const [isTouch] = useState(
    () => 'ontouchstart' in window || navigator.maxTouchPoints > 0
  );
  return isTouch;
};
