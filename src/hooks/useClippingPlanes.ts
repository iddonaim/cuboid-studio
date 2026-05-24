import { useMemo } from 'react';
import * as THREE from 'three';
import { useSectionCutStore } from '../store/useSectionCutStore';

/** Build Three.js clipping planes from the shared section-cut store. */
export function useClippingPlanes(): THREE.Plane[] {
  const enabled = useSectionCutStore(s => s.enabled);
  const axis = useSectionCutStore(s => s.axis);
  const position = useSectionCutStore(s => s.position);

  return useMemo(() => {
    if (!enabled) return [];
    const normal = new THREE.Vector3(
      axis === 'x' ? -1 : 0,
      axis === 'y' ? -1 : 0,
      axis === 'z' ? -1 : 0
    );
    return [new THREE.Plane(normal, position)];
  }, [enabled, axis, position]);
}
