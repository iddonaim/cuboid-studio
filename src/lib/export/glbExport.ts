/**
 * GLB Assembly Export — for AR viewing
 * ======================================
 * Builds a single merged GLB from all placed cubes using the existing
 * pre-computed geometry cache.  The resulting GLB is suitable for
 * model-viewer's AR mode (Scene Viewer on Android, Quick Look on iOS 15+).
 *
 * Unit note:
 *   Our scene uses 42-unit cubes (1 unit ≈ 1 mm).
 *   GLTF/AR convention is 1 unit = 1 metre.
 *   Scale down with model-viewer's `scale` attribute (default 0.01 → 42cm cube).
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { loadVariationFromGLB } from '../cube/csgUtils';
import { PlacedCube } from '../cube/types';
import { CUBE_SIZE } from '../cube/constants';

const GEOMETRY_OFFSET: [number, number, number] = [
  -CUBE_SIZE / 2,
  -CUBE_SIZE / 2,
  -CUBE_SIZE / 2,
];

/**
 * Exports the current assembly as a binary GLB ArrayBuffer.
 *
 * @param placedCubes   - Cubes from useBuilderStore
 * @param geometryOverrides - Optional per-cube pataphysical geometry overrides
 */
export async function exportAssemblyAsGLB(
  placedCubes: PlacedCube[],
  geometryOverrides?: Record<string, THREE.BufferGeometry>,
): Promise<ArrayBuffer> {
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.65,
    metalness: 0.0,
    side: THREE.FrontSide,
  });

  const exportGroup = new THREE.Group();

  await Promise.all(
    placedCubes.map(async cube => {
      // Use pataphysical override geometry if available, otherwise load GLB
      let geometry: THREE.BufferGeometry;
      if (geometryOverrides?.[cube.id]) {
        geometry = geometryOverrides[cube.id].clone();
      } else {
        const loaded = await loadVariationFromGLB(cube.variationId);
        geometry = loaded.clone();
      }

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...GEOMETRY_OFFSET);

      const group = new THREE.Group();
      group.position.set(...cube.position);
      group.rotation.x = (cube.rotation.x * Math.PI) / 2;
      group.rotation.y = (cube.rotation.y * Math.PI) / 2;
      group.add(mesh);

      exportGroup.add(group);
    }),
  );

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      exportGroup,
      result => resolve(result as ArrayBuffer),
      err => reject(err),
      { binary: true },
    );
  });
}

/** Returns a Blob URL pointing to the exported GLB. Caller must revoke it. */
export async function createAssemblyGLBUrl(
  placedCubes: PlacedCube[],
  geometryOverrides?: Record<string, THREE.BufferGeometry>,
): Promise<string> {
  const buffer = await exportAssemblyAsGLB(placedCubes, geometryOverrides);
  const blob = new Blob([buffer], { type: 'model/gltf-binary' });
  return URL.createObjectURL(blob);
}
