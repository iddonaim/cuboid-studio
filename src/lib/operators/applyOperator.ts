import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { CUBE_SIZE } from '../cube/constants';
import { LLMOperatorResult } from './types';

/**
 * Creates a Three.js cutter geometry from the LLM's structured output.
 */
export function createCutterFromLLMOutput(
  result: LLMOperatorResult,
  targetBoundingBox: THREE.Box3
): THREE.BufferGeometry {
  const { type, proportions, position, rotation } = result.cutter;
  const scale = Math.max(0.05, Math.min(result.magnitude, 1.0));

  // Clamp proportions to safe range
  const p = proportions.map(v => Math.max(0.01, Math.min(v, 2.0))) as [number, number, number];

  let geometry: THREE.BufferGeometry;

  switch (type) {
    case 'box':
      geometry = new THREE.BoxGeometry(
        p[0] * CUBE_SIZE * scale,
        p[1] * CUBE_SIZE * scale,
        p[2] * CUBE_SIZE * scale
      );
      break;
    case 'sphere':
      geometry = new THREE.SphereGeometry(
        p[0] * CUBE_SIZE * scale * 0.5,
        24, 24
      );
      break;
    case 'cylinder':
      geometry = new THREE.CylinderGeometry(
        p[0] * CUBE_SIZE * scale * 0.5,
        p[0] * CUBE_SIZE * scale * 0.5,
        p[1] * CUBE_SIZE * scale,
        24
      );
      break;
    case 'plane':
      geometry = new THREE.BoxGeometry(
        p[0] * CUBE_SIZE * scale,
        0.5,
        p[2] * CUBE_SIZE * scale
      );
      break;
    default:
      geometry = new THREE.BoxGeometry(
        CUBE_SIZE * 0.3 * scale,
        CUBE_SIZE * 0.3 * scale,
        CUBE_SIZE * 0.3 * scale
      );
  }

  // Position: map [-1, 1] to cube bounding box
  const center = new THREE.Vector3();
  targetBoundingBox.getCenter(center);
  const size = new THREE.Vector3();
  targetBoundingBox.getSize(size);

  // Clamp position to [-1, 1]
  const pos = position.map(v => Math.max(-1, Math.min(v, 1))) as [number, number, number];

  const worldX = center.x + pos[0] * (size.x / 2);
  const worldY = center.y + pos[1] * (size.y / 2);
  const worldZ = center.z + pos[2] * (size.z / 2);

  // Apply rotation (degrees to radians), then translation
  const rotX = (rotation[0] * Math.PI) / 180;
  const rotY = (rotation[1] * Math.PI) / 180;
  const rotZ = (rotation[2] * Math.PI) / 180;

  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler(rotX, rotY, rotZ, 'XYZ');
  matrix.makeRotationFromEuler(euler);
  matrix.setPosition(worldX, worldY, worldZ);
  geometry.applyMatrix4(matrix);

  return geometry;
}

/**
 * Applies a boolean subtraction of the cutter from the target geometry.
 * Returns a new geometry. The original is not modified.
 */
export function applyCutterToGeometry(
  targetGeometry: THREE.BufferGeometry,
  cutterGeometry: THREE.BufferGeometry
): THREE.BufferGeometry {
  const evaluator = new Evaluator();

  const targetBrush = new Brush(targetGeometry.clone(), new THREE.MeshStandardMaterial());
  const cutterBrush = new Brush(cutterGeometry, new THREE.MeshStandardMaterial());

  try {
    const result = evaluator.evaluate(targetBrush, cutterBrush, SUBTRACTION);
    return result.geometry.clone();
  } catch (error) {
    console.error('CSG subtraction failed:', error);
    // Return original geometry unchanged
    return targetGeometry.clone();
  }
}

/**
 * Full pipeline: take LLM result, create cutter, apply to target.
 */
export function applyLLMOperator(
  targetGeometry: THREE.BufferGeometry,
  result: LLMOperatorResult
): THREE.BufferGeometry {
  // Compute target bounding box
  targetGeometry.computeBoundingBox();
  const bbox = targetGeometry.boundingBox;
  if (!bbox) {
    console.error('Cannot compute bounding box for target geometry');
    return targetGeometry.clone();
  }

  const cutterGeometry = createCutterFromLLMOutput(result, bbox);
  return applyCutterToGeometry(targetGeometry, cutterGeometry);
}
