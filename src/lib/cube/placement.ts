import * as THREE from 'three';
import { Face } from './connectionRules';
import { GRID_STRIDE, CUBE_SIZE } from './constants';

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
