/**
 * Glides the camera to frame the cube tied to the current selection — the
 * previewed Evolve candidate's target, or the cube clicked in the
 * Pataphysical / Evolve viewport. Short eased move, never locks the user
 * out: any manual orbit/pan/zoom cancels the glide immediately.
 */
import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useEvolutionStore } from '../../store/useEvolutionStore';
import { useMemeStore } from '../../store/useMemeStore';
import { CUBE_SIZE } from '../../lib/cube/constants';

const GLIDE_SECONDS = 0.6;

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

interface Glide {
  t: number;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
}

export const ZoomToCube: React.FC<{ active: boolean }> = ({ active }) => {
  const camera = useThree(s => s.camera);
  const controls = useThree(s => s.controls) as OrbitControlsImpl | null;
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const previewCandidateId = useEvolutionStore(s => s.previewCandidateId);
  const candidates = useEvolutionStore(s => s.candidates);
  const targetCubeId = useMemeStore(s => s.targetCubeId);

  const focusCubeId =
    candidates.find(c => c.id === previewCandidateId)?.targetCubeId ?? targetCubeId;

  const glide = useRef<Glide | null>(null);
  const lastFocus = useRef<string | null>(null);

  useEffect(() => {
    if (!active || !controls) return;
    if (!focusCubeId) {
      // Deselect leaves the camera where it is; clear so re-selecting the
      // same cube glides again.
      lastFocus.current = null;
      return;
    }
    if (focusCubeId === lastFocus.current) return;
    lastFocus.current = focusCubeId;

    const cube = placedCubes.find(c => c.id === focusCubeId);
    if (!cube) return;

    const toTarget = new THREE.Vector3(...cube.position);
    const offset = camera.position.clone().sub(controls.target);
    let toPos: THREE.Vector3;
    if (camera instanceof THREE.PerspectiveCamera && offset.lengthSq() > 1e-6) {
      // Keep the viewing direction; come in close enough that one cube
      // fills the frame without clipping its neighbours out entirely.
      const distance = THREE.MathUtils.clamp(offset.length(), CUBE_SIZE * 2.4, CUBE_SIZE * 4.5);
      toPos = toTarget.clone().add(offset.normalize().multiplyScalar(distance));
    } else {
      // Orthographic (or degenerate offset): recenter only, keep zoom.
      toPos = toTarget.clone().add(offset);
    }

    glide.current = {
      t: 0,
      fromTarget: controls.target.clone(),
      toTarget,
      fromPos: camera.position.clone(),
      toPos,
    };
  }, [active, focusCubeId, controls, camera, placedCubes]);

  // Manual camera input wins instantly, and also re-arms the same cube.
  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      glide.current = null;
      lastFocus.current = null;
    };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  useFrame((_, delta) => {
    const g = glide.current;
    if (!g || !controls) return;
    g.t = Math.min(1, g.t + delta / GLIDE_SECONDS);
    const e = easeInOutCubic(g.t);
    controls.target.lerpVectors(g.fromTarget, g.toTarget, e);
    camera.position.lerpVectors(g.fromPos, g.toPos, e);
    controls.update();
    if (g.t >= 1) glide.current = null;
  });

  return null;
};
