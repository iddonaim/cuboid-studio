import React, { useLayoutEffect, useRef } from 'react';
import { PerspectiveCamera, OrthographicCamera } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useAppStore } from '../../store/useAppStore';
import { useAssemblyBounds } from '../../hooks/useAssemblyBounds';
import {
  fitOrthoFrustum,
  transferToOrthographic,
  transferToPerspective,
} from '../../lib/viewport/cameraUtils';

interface SceneFlags {
  showBuilderScene: boolean;
  showEncodingScene: boolean;
  showPataphysicalScene: boolean;
  showEvolutionScene: boolean;
}

const INITIAL_POSITION: [number, number, number] = [150, 150, 150];

/**
 * Owns perspective / orthographic cameras and swaps the R3F default on toggle.
 * Keeps OrbitControls.object in sync when the active camera changes.
 */
export const CameraController: React.FC<SceneFlags> = (flags) => {
  const orthographic = useAppStore(s => s.orthographic);
  const bounds = useAssemblyBounds(flags);
  const size = useThree(s => s.size);
  const set = useThree(s => s.set);
  const controls = useThree(s => s.controls) as OrbitControlsImpl | null;

  const perspRef = useRef<THREE.PerspectiveCamera>(null);
  const orthoRef = useRef<THREE.OrthographicCamera>(null);
  const prevOrthoRef = useRef(orthographic);
  const initializedRef = useRef(false);

  const aspect = size.width / Math.max(size.height, 1);

  // Activate the correct camera and transfer view state on mode toggle.
  useLayoutEffect(() => {
    const persp = perspRef.current;
    const ortho = orthoRef.current;
    if (!persp || !ortho) return;

    const toggled = prevOrthoRef.current !== orthographic;
    const target = bounds.center;

    if (!initializedRef.current) {
      persp.aspect = aspect;
      persp.updateProjectionMatrix();
      set({ camera: persp });
      initializedRef.current = true;
    } else if (toggled) {
      if (orthographic) {
        transferToOrthographic(persp, ortho, target, bounds, aspect);
      } else {
        transferToPerspective(ortho, persp, aspect);
      }
    }

    const active = orthographic ? ortho : persp;
    set({ camera: active });

    if (controls) {
      controls.object = active;
      controls.target.copy(target);
      controls.update();
    }

    prevOrthoRef.current = orthographic;
  }, [orthographic, bounds, aspect, set, controls]);

  // Refit ortho frustum when bounds or viewport change while ortho is active.
  useLayoutEffect(() => {
    if (!orthographic || !orthoRef.current) return;
    const zoom = orthoRef.current.zoom;
    fitOrthoFrustum(orthoRef.current, bounds, aspect);
    orthoRef.current.zoom = zoom;
    orthoRef.current.updateProjectionMatrix();
  }, [orthographic, bounds, aspect]);

  // Keep perspective aspect in sync on resize.
  useLayoutEffect(() => {
    if (orthographic || !perspRef.current) return;
    perspRef.current.aspect = aspect;
    perspRef.current.updateProjectionMatrix();
  }, [orthographic, aspect]);

  return (
    <>
      {/* far planes must exceed the ground Grid's fadeDistance (Viewport3D)
          so the floor grid fades out instead of being clipped mid-view. */}
      <PerspectiveCamera
        ref={perspRef}
        fov={50}
        near={0.1}
        far={20000}
        position={INITIAL_POSITION}
      />
      <OrthographicCamera
        ref={orthoRef}
        near={0.1}
        far={20000}
        position={INITIAL_POSITION}
      />
    </>
  );
};
