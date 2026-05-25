import * as THREE from 'three';
import { CUBE_SIZE, GRID_STRIDE } from '../cube/constants';

/** Default orbit focus when no cubes are in the active scene. */
export const DEFAULT_ASSEMBLY_CENTER = new THREE.Vector3(0, CUBE_SIZE / 2, 0);

/** Half-extent used for empty-scene ortho frustum (matches default SpatialGrid size 7). */
export const EMPTY_SCENE_HALF_EXTENT = (7 / 2) * GRID_STRIDE;

export interface AssemblyBounds {
  min: THREE.Vector3;
  max: THREE.Vector3;
  center: THREE.Vector3;
  halfExtent: number;
}

export function assemblyBoundsFromPositions(
  positions: ReadonlyArray<readonly [number, number, number]>,
): AssemblyBounds {
  if (positions.length === 0) {
    const h = EMPTY_SCENE_HALF_EXTENT;
    return {
      min: new THREE.Vector3(-h, 0, -h),
      max: new THREE.Vector3(h, CUBE_SIZE, h),
      center: DEFAULT_ASSEMBLY_CENTER.clone(),
      halfExtent: h,
    };
  }

  const half = CUBE_SIZE / 2;
  const min = new THREE.Vector3(
    Math.min(...positions.map(p => p[0])) - half,
    Math.min(...positions.map(p => p[1])) - half,
    Math.min(...positions.map(p => p[2])) - half,
  );
  const max = new THREE.Vector3(
    Math.max(...positions.map(p => p[0])) + half,
    Math.max(...positions.map(p => p[1])) + half,
    Math.max(...positions.map(p => p[2])) + half,
  );
  const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
  const size = new THREE.Vector3().subVectors(max, min);
  const halfExtent = Math.max(size.x, size.y, size.z) / 2;

  return { min, max, center, halfExtent };
}
