import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { getAdjacentPositionAndFace } from './placement';
import { GRID_STRIDE } from './constants';
import { getAllRotations, type Rotation } from './connectionRules';

/**
 * Hovering a cube's face targets the neighbouring cell in the direction you are
 * pointing. The raycast hands back the hit triangle's normal in the geometry's
 * own space, so on a rotated cube it has to be transformed to world space first
 * — `CubeWithCuts` does that through the object's world matrix.
 *
 * These rebuild that composition with the same rotation convention the viewport
 * applies (`rotation={[x * π/2, y * π/2, 0]}` on the group) and check the cell
 * that comes out is the one actually in that world direction.
 */
describe('face hover targets the cell you are pointing at', () => {
  /** The same local→world transform `CubeWithCuts` applies on a hover. */
  const worldNormalFor = (localNormal: THREE.Vector3, rotation: Rotation) => {
    const group = new THREE.Object3D();
    group.rotation.set((rotation.x * Math.PI) / 2, (rotation.y * Math.PI) / 2, 0);
    group.updateMatrixWorld(true);
    return localNormal
      .clone()
      .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(group.matrixWorld));
  };

  /** Mirrors the viewport: local normal → world, then to an adjacent cell. */
  const cellFor = (localNormal: THREE.Vector3, rotation: Rotation) =>
    getAdjacentPositionAndFace([0, 21, 0], worldNormalFor(localNormal, rotation));

  it('an unrotated cube hovered on top targets the cell above', () => {
    const { position, face } = cellFor(new THREE.Vector3(0, 1, 0), { y: 0, x: 0 });
    expect(face).toBe('Y_POS');
    expect(position).toEqual([0, 21 + GRID_STRIDE, 0]);
  });

  const LOCAL_NORMALS = [
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
  ];

  it('whichever local face ends up pointing up targets the cell above', () => {
    // The regression this locks: the local normal was used as if it were a world
    // direction, so on a rotated cube the face you can see pointing UP sent the
    // preview one cell sideways or in depth instead — into an empty cell with no
    // neighbour, where every rotation looks placeable and the preview goes green.
    //
    // Which local face points up is derived from the rotation here rather than
    // written down, so the test can't encode the same mistake it's checking for.
    for (const rotation of getAllRotations()) {
      const key = `y${rotation.y}x${rotation.x}`;
      const pointingUp = LOCAL_NORMALS.filter(
        local => worldNormalFor(local, rotation).y > 0.5
      );
      // Exactly one of the six faces points up under an axis-aligned rotation.
      expect(pointingUp, key).toHaveLength(1);

      const { position, face } = cellFor(pointingUp[0], rotation);
      expect(face, key).toBe('Y_POS');
      expect(position, key).toEqual([0, 21 + GRID_STRIDE, 0]);
    }
  });

  it('always lands on an orthogonally adjacent cell, for every rotation and face', () => {
    for (const rotation of getAllRotations()) {
      for (const local of LOCAL_NORMALS) {
        const { position } = cellFor(local, rotation);
        const steps =
          Math.abs(position[0] - 0) / GRID_STRIDE +
          Math.abs(position[1] - 21) / GRID_STRIDE +
          Math.abs(position[2] - 0) / GRID_STRIDE;
        expect(steps, `y${rotation.y}x${rotation.x}`).toBeCloseTo(1, 6);
      }
    }
  });
});
