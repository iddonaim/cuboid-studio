import { useState, useEffect } from 'react';

/** True when the primary input is touch (coarse pointer), not mouse. */
export const useCoarsePointer = (): boolean => {
  const [coarse, setCoarse] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const handler = (e: MediaQueryListEvent) => setCoarse(e.matches);
    mq.addEventListener('change', handler);
    setCoarse(mq.matches);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return coarse;
};
