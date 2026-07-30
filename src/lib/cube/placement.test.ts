import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { getAdjacentPositionAndFace, getHoveredFaceFromRay } from './placement';
import { GRID_STRIDE, CUBE_SIZE } from './constants';
import { getAllRotations, type Rotation } from './connectionRules';
import { CUBE_VARIATIONS } from './specifications';
import { generateVariationGeometry } from './csgUtils';

/**
 * Hovering a cube targets the neighbouring cell you are pointing at.
 *
 * The production path reads the ray's entry into the cell box rather than the
 * normal of whatever surface it hit, because the hit surface is very often a
 * sphere or cylinder cavity wall pointing somewhere unrelated to the face being
 * aimed at. These fire real raycasts at real carved geometry to prove it.
 *
 * The `getAdjacentPositionAndFace` group below covers the fallback path, which
 * still reads a normal and so still needs the local→world transform right.
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

/**
 * The real thing: fire a ray at a carved cube from each of the six directions
 * and check the app targets the cell actually in that direction.
 *
 * This is the regression that mattered. Reading the hit triangle's normal —
 * even correctly transformed into world space — put the preview on the wrong
 * cell for about 1 hover in 11, because a ray aimed at a face routinely lands
 * on a curved cavity wall several millimetres in whose normal leans elsewhere.
 * The preview then sat in an unrelated cell; when that cell had no neighbours,
 * every rotation came back valid and it drew green — including apparently
 * resting on an uncut face that nothing can connect to.
 *
 * A representative slice of variations is used to keep this quick. The same
 * sweep over all 70 × 16 rotations × 6 directions (212k rays) also passes.
 */
describe('hovering carved geometry from every direction', () => {
  const DIRECTIONS: [string, THREE.Vector3][] = [
    ['+X', new THREE.Vector3(1, 0, 0)],
    ['-X', new THREE.Vector3(-1, 0, 0)],
    ['above', new THREE.Vector3(0, 1, 0)],
    ['below', new THREE.Vector3(0, -1, 0)],
    ['+Z', new THREE.Vector3(0, 0, 1)],
    ['-Z', new THREE.Vector3(0, 0, -1)],
  ];

  const CUBE_POS: [number, number, number] = [0, CUBE_SIZE / 2, 0];
  const centre = new THREE.Vector3(...CUBE_POS);

  /** The scene graph `CubeWithCuts` builds: rotated group, offset child mesh. */
  const meshFor = (variationId: string, rotation: Rotation) => {
    const variation = CUBE_VARIATIONS.find(v => v.id === variationId)!;
    const group = new THREE.Group();
    group.position.copy(centre);
    group.rotation.set((rotation.x * Math.PI) / 2, (rotation.y * Math.PI) / 2, 0);
    const mesh = new THREE.Mesh(
      generateVariationGeometry(variation),
      // Raycasting respects `material.side`, and the viewport renders FrontSide.
      new THREE.MeshBasicMaterial({ side: THREE.FrontSide })
    );
    mesh.position.set(-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2);
    group.add(mesh);
    new THREE.Scene().add(group);
    group.updateMatrixWorld(true);
    return mesh;
  };

  const cellInDirection = (dir: THREE.Vector3): [number, number, number] =>
    CUBE_POS.map((c, i) =>
      Math.abs(dir.getComponent(i)) > 0.5
        ? c + Math.sign(dir.getComponent(i)) * GRID_STRIDE
        : c
    ) as [number, number, number];

  // A few variations with different cut layouts, including the one whose
  // uncut face showed a green preview in the field. Ids are zero-padded
  // (v-00 … v-69); the guard below keeps a typo from silently shrinking this.
  const SAMPLE = ['v-01', 'v-14', 'v-33', 'v-47', 'v-69'];
  it('samples real variation ids', () => {
    for (const id of SAMPLE) {
      expect(CUBE_VARIATIONS.some(v => v.id === id), id).toBe(true);
    }
  });

  it('targets the cell in the direction pointed, whatever surface the ray lands on', () => {
    expect(SAMPLE.length).toBeGreaterThan(0);
    const raycaster = new THREE.Raycaster();
    let hovers = 0;

    for (const variationId of SAMPLE) {
      for (const rotation of getAllRotations()) {
        const mesh = meshFor(variationId, rotation);

        for (const [dirName, dir] of DIRECTIONS) {
          const want = cellInDirection(dir);
          // Two axes across the face, so rays land on flat rim, cavity wall and
          // everything between rather than only dead centre.
          const acrossA = Math.abs(dir.y) > 0.5
            ? new THREE.Vector3(1, 0, 0)
            : new THREE.Vector3(0, 1, 0);
          const acrossB = new THREE.Vector3().crossVectors(dir, acrossA).normalize();

          for (const a of [-16, -8, 0, 8, 16]) {
            for (const b of [-16, 0, 16]) {
              const aim = centre.clone()
                .add(acrossA.clone().multiplyScalar(a))
                .add(acrossB.clone().multiplyScalar(b));
              const origin = aim.clone().add(dir.clone().multiplyScalar(400));
              raycaster.set(origin, aim.clone().sub(origin).normalize());

              // A ray straight through a hole hits nothing — no hover fires at
              // all, which is a miss rather than a wrong answer.
              if (raycaster.intersectObject(mesh, true).length === 0) continue;

              const where = `${variationId} y${rotation.y}x${rotation.x} ${dirName} a=${a} b=${b}`;
              const resolved = getHoveredFaceFromRay(CUBE_POS, raycaster.ray);
              expect(resolved, where).not.toBeNull();
              expect(resolved!.position, where).toEqual(want);
              hovers++;
            }
          }
        }
      }
    }

    // Guard against the loops silently degenerating into nothing.
    expect(hovers).toBeGreaterThan(1000);
  });

  it('declines to answer when the camera is inside the cell', () => {
    // `Ray.intersectBox` returns the exit point from inside, which would name
    // the face opposite the one being pointed at. The caller falls back instead.
    const ray = new THREE.Ray(centre.clone(), new THREE.Vector3(0, 1, 0));
    expect(getHoveredFaceFromRay(CUBE_POS, ray)).toBeNull();
  });

  it('declines to answer when the ray misses the cell entirely', () => {
    const ray = new THREE.Ray(
      new THREE.Vector3(500, CUBE_SIZE / 2, 0),
      new THREE.Vector3(0, 0, 1)
    );
    expect(getHoveredFaceFromRay(CUBE_POS, ray)).toBeNull();
  });
});
