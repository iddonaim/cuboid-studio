import * as THREE from 'three';
import { EMPTY_SCENE_HALF_EXTENT, type AssemblyBounds } from './assemblyBounds';

const PADDING = 1.15;

/** Size the ortho frustum to contain the assembly bounds (or empty-scene fallback). */
export function fitOrthoFrustum(
  camera: THREE.OrthographicCamera,
  bounds: AssemblyBounds,
  aspect: number,
): void {
  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  const depth = bounds.max.z - bounds.min.z;
  const maxDim = Math.max(width, height, depth, EMPTY_SCENE_HALF_EXTENT * 2) * PADDING;

  if (aspect >= 1) {
    camera.left = (-maxDim * aspect) / 2;
    camera.right = (maxDim * aspect) / 2;
    camera.top = maxDim / 2;
    camera.bottom = -maxDim / 2;
  } else {
    camera.left = -maxDim / 2;
    camera.right = maxDim / 2;
    camera.top = maxDim / aspect / 2;
    camera.bottom = -maxDim / aspect / 2;
  }

  // Keep far beyond the ground grid's fadeDistance so the floor never
  // gets frustum-clipped in ortho views.
  //
  // near is NEGATIVE (CAD convention): an orthographic view has no meaningful
  // "behind the camera", so nothing should vanish when the camera plane moves
  // inside the model or its grid while zooming/orbiting.
  camera.far = Math.max(20000, maxDim * 12);
  camera.near = -camera.far;
  camera.updateProjectionMatrix();
}

/** Switch to orthographic while preserving the current view direction and apparent scale. */
export function transferToOrthographic(
  persp: THREE.PerspectiveCamera,
  ortho: THREE.OrthographicCamera,
  target: THREE.Vector3,
  bounds: AssemblyBounds,
  aspect: number,
): void {
  ortho.position.copy(persp.position);
  ortho.quaternion.copy(persp.quaternion);
  ortho.up.copy(persp.up);

  fitOrthoFrustum(ortho, bounds, aspect);

  const distance = persp.position.distanceTo(target);
  const vFov = (persp.fov * Math.PI) / 180;
  const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
  const frustumHeight = ortho.top - ortho.bottom;
  ortho.zoom = Math.max(0.01, frustumHeight / visibleHeight);
  ortho.updateProjectionMatrix();
}

/** Switch back to perspective while preserving position and orientation. */
export function transferToPerspective(
  ortho: THREE.OrthographicCamera,
  persp: THREE.PerspectiveCamera,
  aspect: number,
): void {
  persp.position.copy(ortho.position);
  persp.quaternion.copy(ortho.quaternion);
  persp.up.copy(ortho.up);
  persp.aspect = aspect;
  persp.updateProjectionMatrix();
}
