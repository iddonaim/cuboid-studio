import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  CANONICAL_CUBE_BBOX,
  normalizedPositionToCubeLocal,
  createCutterFromLLMOutput,
  applyLLMOperator,
} from './applyOperator';
import { CUBE_SIZE } from '../cube/constants';
import type { LLMOperatorResult } from './types';

function makeResult(overrides: Partial<LLMOperatorResult> = {}): LLMOperatorResult {
  return {
    operator: 'inversion',
    targets: ['adjacency'],
    magnitude: 0.5,
    decay: 0.5,
    reasoning: '',
    cutter: {
      type: 'box',
      proportions: [1, 1, 1],
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    },
    ...overrides,
  };
}

function boundingSize(geometry: THREE.BufferGeometry): THREE.Vector3 {
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox!.getSize(size);
  return size;
}

function boundingCenter(geometry: THREE.BufferGeometry): THREE.Vector3 {
  geometry.computeBoundingBox();
  const center = new THREE.Vector3();
  geometry.boundingBox!.getCenter(center);
  return center;
}

describe('CANONICAL_CUBE_BBOX', () => {
  it('spans one cube from the origin', () => {
    expect(CANONICAL_CUBE_BBOX.min).toEqual(new THREE.Vector3(0, 0, 0));
    expect(CANONICAL_CUBE_BBOX.max).toEqual(new THREE.Vector3(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE));
  });
});

describe('normalizedPositionToCubeLocal', () => {
  it('maps the normalized range [-1, 1] to cube-local [0, CUBE_SIZE]', () => {
    expect(normalizedPositionToCubeLocal([-1, -1, -1])).toEqual([0, 0, 0]);
    expect(normalizedPositionToCubeLocal([1, 1, 1])).toEqual([CUBE_SIZE, CUBE_SIZE, CUBE_SIZE]);
    expect(normalizedPositionToCubeLocal([0, 0, 0])).toEqual([CUBE_SIZE / 2, CUBE_SIZE / 2, CUBE_SIZE / 2]);
  });

  it('clamps out-of-range input instead of extrapolating past the cube', () => {
    expect(normalizedPositionToCubeLocal([-5, 5, 0])).toEqual([0, CUBE_SIZE, CUBE_SIZE / 2]);
  });
});

describe('createCutterFromLLMOutput — per cutter-type geometry', () => {
  it('box: full-size cube centered at the mapped position', () => {
    const geometry = createCutterFromLLMOutput(makeResult({
      cutter: { type: 'box', proportions: [1, 1, 1], position: [0, 0, 0], rotation: [0, 0, 0] },
    }));
    const size = boundingSize(geometry);
    const center = boundingCenter(geometry);
    expect(size.x).toBeCloseTo(CUBE_SIZE, 1);
    expect(size.y).toBeCloseTo(CUBE_SIZE, 1);
    expect(size.z).toBeCloseTo(CUBE_SIZE, 1);
    expect(center.x).toBeCloseTo(CUBE_SIZE / 2, 1);
    expect(center.y).toBeCloseTo(CUBE_SIZE / 2, 1);
    expect(center.z).toBeCloseTo(CUBE_SIZE / 2, 1);
  });

  it('sphere: diameter is proportions[0] × CUBE_SIZE', () => {
    const geometry = createCutterFromLLMOutput(makeResult({
      cutter: { type: 'sphere', proportions: [0.5, 0, 0], position: [-1, -1, -1], rotation: [0, 0, 0] },
    }));
    const size = boundingSize(geometry);
    const expectedDiameter = 0.5 * CUBE_SIZE;
    expect(size.x).toBeCloseTo(expectedDiameter, 0);
    expect(size.y).toBeCloseTo(expectedDiameter, 0);
    expect(size.z).toBeCloseTo(expectedDiameter, 0);
  });

  it('cylinder: radius from proportions[0], height from proportions[1]', () => {
    const geometry = createCutterFromLLMOutput(makeResult({
      cutter: { type: 'cylinder', proportions: [0.5, 1, 0], position: [0, 0, 0], rotation: [0, 0, 0] },
    }));
    const size = boundingSize(geometry);
    // Three.js CylinderGeometry's local axis is Y; no rotation is applied in this case.
    expect(size.y).toBeCloseTo(1 * CUBE_SIZE, 0);
    expect(size.x).toBeCloseTo(0.5 * CUBE_SIZE, 0);
    expect(size.z).toBeCloseTo(0.5 * CUBE_SIZE, 0);
  });

  it('plane: a thin slab sized by proportions[0] and proportions[2]', () => {
    const geometry = createCutterFromLLMOutput(makeResult({
      cutter: { type: 'plane', proportions: [0.5, 0, 0.8], position: [0, 0, 0], rotation: [0, 0, 0] },
    }));
    const size = boundingSize(geometry);
    expect(size.x).toBeCloseTo(0.5 * CUBE_SIZE, 1);
    expect(size.y).toBeCloseTo(0.5, 1); // fixed thin thickness, independent of proportions
    expect(size.z).toBeCloseTo(0.8 * CUBE_SIZE, 1);
  });

  it('clamps proportions to [0.01, 2.0] before sizing', () => {
    const geometry = createCutterFromLLMOutput(makeResult({
      cutter: { type: 'box', proportions: [10, 10, 10], position: [0, 0, 0], rotation: [0, 0, 0] },
    }));
    const size = boundingSize(geometry);
    expect(size.x).toBeCloseTo(2.0 * CUBE_SIZE, 1);
  });
});

describe('applyLLMOperator — CSG subtraction', () => {
  function fullCube(): THREE.BufferGeometry {
    const geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    geometry.translate(CUBE_SIZE / 2, CUBE_SIZE / 2, CUBE_SIZE / 2); // align to CANONICAL_CUBE_BBOX
    return geometry;
  }

  it('subtracts a sphere bite without growing outside the original bounds', () => {
    const target = fullCube();
    const targetSize = boundingSize(fullCube());
    const result = applyLLMOperator(target, makeResult({
      cutter: { type: 'sphere', proportions: [0.6, 0, 0], position: [0, 0, 0], rotation: [0, 0, 0] },
    }));

    expect(result.getAttribute('position').count).toBeGreaterThan(0);

    const resultSize = boundingSize(result);
    const epsilon = 0.5;
    expect(resultSize.x).toBeLessThanOrEqual(targetSize.x + epsilon);
    expect(resultSize.y).toBeLessThanOrEqual(targetSize.y + epsilon);
    expect(resultSize.z).toBeLessThanOrEqual(targetSize.z + epsilon);
  });

  it('actually cuts — the result is not just a pass-through clone of the untouched target', () => {
    const target = fullCube();
    const untouchedCount = target.getAttribute('position').count;
    const result = applyLLMOperator(target, makeResult({
      cutter: { type: 'box', proportions: [0.5, 0.5, 0.5], position: [0, 0, 0], rotation: [0, 0, 0] },
    }));
    // The fallback-on-failure path returns a clone with the same vertex count as the
    // untouched target — a different count proves the CSG subtraction actually ran.
    expect(result.getAttribute('position').count).not.toBe(untouchedCount);
  });

  it('does not mutate the original target geometry', () => {
    const target = fullCube();
    const originalCount = target.getAttribute('position').count;
    applyLLMOperator(target, makeResult());
    expect(target.getAttribute('position').count).toBe(originalCount);
  });
});
