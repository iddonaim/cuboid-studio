import { useMemo } from 'react';
import * as THREE from 'three';
import { useSectionCutStore } from '../store/useSectionCutStore';

export interface SectionCut {
  enabled: boolean;
  axis: 'x' | 'y' | 'z';
  position: number;
  /** Keep the half above the plane instead of the half below it. */
  flipped: boolean;
}

/**
 * The section cut as Three.js clipping planes. Pure, and exported on its own so
 * the sign convention — the whole of what "flip" means — is testable without a
 * DOM.
 *
 * Three clips away every point where `normal·p + constant < 0`. The unflipped
 * normal points down the chosen axis, so the half below `position` survives;
 * negating both the normal and the constant leaves the plane exactly where it
 * is and swaps which half is discarded.
 */
export function buildClippingPlanes(cut: SectionCut): THREE.Plane[] {
  if (!cut.enabled) return [];
  const sign = cut.flipped ? 1 : -1;
  const normal = new THREE.Vector3(
    cut.axis === 'x' ? sign : 0,
    cut.axis === 'y' ? sign : 0,
    cut.axis === 'z' ? sign : 0
  );
  return [new THREE.Plane(normal, -sign * cut.position)];
}

/** Build Three.js clipping planes from the shared section-cut store. */
export function useClippingPlanes(): THREE.Plane[] {
  const enabled = useSectionCutStore(s => s.enabled);
  const axis = useSectionCutStore(s => s.axis);
  const position = useSectionCutStore(s => s.position);
  const flipped = useSectionCutStore(s => s.flipped);

  return useMemo(
    () => buildClippingPlanes({ enabled, axis, position, flipped }),
    [enabled, axis, position, flipped]
  );
}
