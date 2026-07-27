import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildClippingPlanes, SectionCut } from './useClippingPlanes';

/**
 * Three.js clips away every point where `normal·p + constant < 0`, so a plane's
 * sign convention is the whole of what "flip" means. These assert the surviving
 * half directly rather than the raw normal/constant, since that's what actually
 * shows up on screen.
 */
const survives = (planes: THREE.Plane[], p: [number, number, number]) =>
  planes.every(pl => pl.distanceToPoint(new THREE.Vector3(...p)) >= 0);

const cut = (over: Partial<SectionCut> = {}): SectionCut => ({
  enabled: true,
  axis: 'y',
  position: 50,
  flipped: false,
  ...over,
});

describe('buildClippingPlanes', () => {
  it('produces no planes while the cut is off', () => {
    expect(buildClippingPlanes(cut({ enabled: false }))).toEqual([]);
    // ...even when flipped, so the toggle can never resurrect a disabled cut.
    expect(buildClippingPlanes(cut({ enabled: false, flipped: true }))).toEqual([]);
  });

  it('unflipped keeps the half below the plane', () => {
    const planes = buildClippingPlanes(cut());
    expect(survives(planes, [0, 10, 0])).toBe(true);
    expect(survives(planes, [0, 90, 0])).toBe(false);
  });

  it('flipped keeps the half above the plane', () => {
    const planes = buildClippingPlanes(cut({ flipped: true }));
    expect(survives(planes, [0, 10, 0])).toBe(false);
    expect(survives(planes, [0, 90, 0])).toBe(true);
  });

  it('flipping leaves the plane where it is — only the kept half changes', () => {
    const plain = buildClippingPlanes(cut())[0];
    const other = buildClippingPlanes(cut({ flipped: true }))[0];

    // A point ON the plane sits on the boundary either way...
    const onPlane = new THREE.Vector3(0, 50, 0);
    expect(plain.distanceToPoint(onPlane)).toBeCloseTo(0);
    expect(other.distanceToPoint(onPlane)).toBeCloseTo(0);
    // ...and the normals are exact opposites.
    expect(other.normal.dot(plain.normal)).toBeCloseTo(-1);
  });

  it('flips on every axis, including negative cut positions', () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      const i = { x: 0, y: 1, z: 2 }[axis];
      for (const position of [-120, 0, 50]) {
        const below: [number, number, number] = [0, 0, 0];
        const above: [number, number, number] = [0, 0, 0];
        below[i] = position - 30;
        above[i] = position + 30;

        const plain = buildClippingPlanes(cut({ axis, position }));
        expect(survives(plain, below)).toBe(true);
        expect(survives(plain, above)).toBe(false);

        const other = buildClippingPlanes(cut({ axis, position, flipped: true }));
        expect(survives(other, below)).toBe(false);
        expect(survives(other, above)).toBe(true);
      }
    }
  });

  it('the poché test recovers the plane coordinate in both directions', () => {
    // Mirrors CubeWithCuts' planeSlicesCube, which decides whether a cube gets
    // its cut-surface paint. Reading `constant` directly would be right for
    // only one of the two directions.
    const coordOf = (plane: THREE.Plane, i: number) =>
      -plane.constant / plane.normal.getComponent(i);

    expect(coordOf(buildClippingPlanes(cut({ position: 63 }))[0], 1)).toBeCloseTo(63);
    expect(coordOf(buildClippingPlanes(cut({ position: 63, flipped: true }))[0], 1))
      .toBeCloseTo(63);
    expect(coordOf(buildClippingPlanes(cut({ axis: 'x', position: -42 }))[0], 0))
      .toBeCloseTo(-42);
    expect(coordOf(buildClippingPlanes(cut({ axis: 'x', position: -42, flipped: true }))[0], 0))
      .toBeCloseTo(-42);
  });
});
