import * as THREE from 'three';
import { Face } from './connectionRules';
import { GRID_STRIDE, CUBE_SIZE } from './constants';

/**
 * Which cell a pointing ray is aiming at, and the face of `cubePosition` it
 * crosses to get there.
 *
 * Deliberately ignores the surface the ray actually hit. Every cube is carved
 * by spheres and cylinders, so a ray aimed squarely at a face routinely lands
 * on a curved cavity wall several millimetres in, and that wall's normal points
 * somewhere else entirely — pointing at the side of a deeply cut cube would
 * report its top, or its back. Reading the hit normal is unreliable by
 * construction, not just when the normal is in the wrong coordinate space.
 *
 * The cell boundary, by contrast, is a plain axis-aligned box, and a ray
 * approaching from outside crosses exactly one of its faces on the way in.
 * That face is what the user is pointing at, whatever the cutters left behind
 * it. Returns null when there is no entry face to speak of — the camera is
 * inside this cell, or the ray misses the box — and the caller falls back.
 */
export function getHoveredFaceFromRay(
  cubePosition: [number, number, number],
  ray: THREE.Ray
): { position: [number, number, number]; face: Face } | null {
  const center = new THREE.Vector3(cubePosition[0], cubePosition[1], cubePosition[2]);
  const half = CUBE_SIZE / 2;
  const box = new THREE.Box3(
    center.clone().subScalar(half),
    center.clone().addScalar(half)
  );

  // `intersectBox` hands back the *exit* point when the origin is already
  // inside, which would name the face opposite the one being pointed at.
  if (box.containsPoint(ray.origin)) return null;

  const entry = ray.intersectBox(box, new THREE.Vector3());
  if (!entry) return null;

  // On the entry face, one component sits on the box boundary and dominates the
  // other two. An exact edge or corner hit is a tie, and either answer there is
  // equally defensible.
  const d = entry.sub(center);
  const components = [d.x, d.y, d.z];
  let axis = 0;
  for (let i = 1; i < 3; i++) {
    if (Math.abs(components[i]) > Math.abs(components[axis])) axis = i;
  }

  const normal = new THREE.Vector3();
  normal.setComponent(axis, Math.sign(components[axis]) || 1);

  // Delegated so the normal → face/offset convention has exactly one home.
  return getAdjacentPositionAndFace(cubePosition, normal);
}

/**
 * Calculate adjacent cube position and face based on face normal.
 */
export function getAdjacentPositionAndFace(
  cubePosition: [number, number, number],
  faceNormal: THREE.Vector3
): { position: [number, number, number]; face: Face } {
  const absX = Math.abs(faceNormal.x);
  const absY = Math.abs(faceNormal.y);
  const absZ = Math.abs(faceNormal.z);

  let offset: [number, number, number] = [0, 0, 0];
  let face: Face = 'Y_POS';

  if (absX > absY && absX > absZ) {
    offset = [Math.sign(faceNormal.x) * GRID_STRIDE, 0, 0];
    face = faceNormal.x > 0 ? 'X_POS' : 'X_NEG';
  } else if (absY > absX && absY > absZ) {
    offset = [0, Math.sign(faceNormal.y) * GRID_STRIDE, 0];
    face = faceNormal.y > 0 ? 'Y_POS' : 'Y_NEG';
  } else {
    offset = [0, 0, Math.sign(faceNormal.z) * GRID_STRIDE];
    face = faceNormal.z > 0 ? 'Z_POS' : 'Z_NEG';
  }

  return {
    position: [
      cubePosition[0] + offset[0],
      cubePosition[1] + offset[1],
      cubePosition[2] + offset[2]
    ],
    face
  };
}
