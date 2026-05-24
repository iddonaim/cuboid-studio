import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { CUBE_SIZE } from '../cube/constants';
import { LLMOperatorResult } from './types';

/** Cube-local space: origin at one corner, opposite corner at (CUBE_SIZE, CUBE_SIZE, CUBE_SIZE). */
export const CANONICAL_CUBE_BBOX = new THREE.Box3(
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE)
);

/** Map normalized position [-1, 1] to cube-local coordinates [0, CUBE_SIZE]. */
export function normalizedPositionToCubeLocal(
  position: [number, number, number]
): [number, number, number] {
  return position.map((v) => {
    const clamped = Math.max(-1, Math.min(v, 1));
    return ((clamped + 1) * CUBE_SIZE) / 2;
  }) as [number, number, number];
}

function clampProportions(
  proportions: [number, number, number]
): [number, number, number] {
  return proportions.map((v) => Math.max(0.01, Math.min(v, 2.0))) as [number, number, number];
}

function describeCutterDimensions(
  type: LLMOperatorResult['cutter']['type'],
  p: [number, number, number]
): { size?: [number, number, number]; radius?: number; height?: number } {
  switch (type) {
    case 'sphere':
      return { radius: p[0] * CUBE_SIZE * 0.5 };
    case 'cylinder':
      return {
        radius: p[0] * CUBE_SIZE * 0.5,
        height: p[1] * CUBE_SIZE,
      };
    case 'plane':
      return { size: [p[0] * CUBE_SIZE, 0.5, p[2] * CUBE_SIZE] };
    case 'box':
    default:
      return { size: [p[0] * CUBE_SIZE, p[1] * CUBE_SIZE, p[2] * CUBE_SIZE] };
  }
}

/**
 * Creates a Three.js cutter geometry from the LLM's structured output.
 * Sizes use proportions × CUBE_SIZE (42). Positions use normalized [-1, 1] → [0, 42].
 */
export function createCutterFromLLMOutput(
  result: LLMOperatorResult,
  _targetBoundingBox?: THREE.Box3
): THREE.BufferGeometry {
  const { type, proportions, position, rotation } = result.cutter;
  const p = clampProportions(proportions);

  let geometry: THREE.BufferGeometry;

  switch (type) {
    case 'box':
      geometry = new THREE.BoxGeometry(
        p[0] * CUBE_SIZE,
        p[1] * CUBE_SIZE,
        p[2] * CUBE_SIZE
      );
      break;
    case 'sphere':
      geometry = new THREE.SphereGeometry(p[0] * CUBE_SIZE * 0.5, 24, 24);
      break;
    case 'cylinder':
      geometry = new THREE.CylinderGeometry(
        p[0] * CUBE_SIZE * 0.5,
        p[0] * CUBE_SIZE * 0.5,
        p[1] * CUBE_SIZE,
        24
      );
      break;
    case 'plane':
      geometry = new THREE.BoxGeometry(p[0] * CUBE_SIZE, 0.5, p[2] * CUBE_SIZE);
      break;
    default:
      geometry = new THREE.BoxGeometry(
        CUBE_SIZE * 0.3,
        CUBE_SIZE * 0.3,
        CUBE_SIZE * 0.3
      );
  }

  const [worldX, worldY, worldZ] = normalizedPositionToCubeLocal(position);

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
  cutterGeometry.computeBoundingBox();
  const cutterBox = cutterGeometry.boundingBox;
  if (cutterBox) {
    const cutterSize = new THREE.Vector3();
    cutterBox.getSize(cutterSize);
    const cutterCenter = new THREE.Vector3();
    cutterBox.getCenter(cutterCenter);
    console.log('[CSG] cutter world-space', {
      center: {
        x: cutterCenter.x.toFixed(2),
        y: cutterCenter.y.toFixed(2),
        z: cutterCenter.z.toFixed(2),
      },
      size: {
        x: cutterSize.x.toFixed(2),
        y: cutterSize.y.toFixed(2),
        z: cutterSize.z.toFixed(2),
      },
    });
  }

  const evaluator = new Evaluator();

  const targetBrush = new Brush(targetGeometry.clone(), new THREE.MeshStandardMaterial());
  const cutterBrush = new Brush(cutterGeometry, new THREE.MeshStandardMaterial());

  try {
    const result = evaluator.evaluate(targetBrush, cutterBrush, SUBTRACTION);
    return result.geometry.clone();
  } catch (error) {
    console.error('CSG subtraction failed:', error);
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
  const p = clampProportions(result.cutter.proportions);
  const worldPosition = normalizedPositionToCubeLocal(result.cutter.position);
  const dimensions = describeCutterDimensions(result.cutter.type, p);

  console.log('[CSG] applying operator', {
    type: result.cutter.type,
    proportions: result.cutter.proportions,
    normalizedPosition: result.cutter.position,
    worldPosition: {
      x: worldPosition[0].toFixed(2),
      y: worldPosition[1].toFixed(2),
      z: worldPosition[2].toFixed(2),
    },
    cutterDimensions: dimensions,
    cubeSize: CUBE_SIZE,
  });

  const cutterGeometry = createCutterFromLLMOutput(result);
  return applyCutterToGeometry(targetGeometry, cutterGeometry);
}
