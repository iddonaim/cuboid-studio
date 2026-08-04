import React, { useCallback, useEffect, useRef } from 'react';
import { OrbitControls, GizmoHelper, GizmoViewcube } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useAppStore } from '../../store/useAppStore';
import { useAssemblyBounds } from '../../hooks/useAssemblyBounds';

interface SceneFlags {
  showBuilderScene: boolean;
  showEncodingScene: boolean;
  showPataphysicalScene: boolean;
  showEvolutionScene: boolean;
}

/** Keeps OrbitControls.target aligned with the active assembly center. */
const OrbitTargetSync: React.FC<{ center: THREE.Vector3 }> = ({ center }) => {
  const controls = useThree(s => s.controls) as OrbitControlsImpl | null;

  useEffect(() => {
    if (!controls) return;
    controls.target.copy(center);
    controls.update();
  }, [controls, center]);

  return null;
};

/**
 * Orbit controls + view cube. Middle-drag pans; right-drag orbits; scroll zooms.
 * Gizmo margin clears the CaptureButton (bottom-right, 36×36 at right-3 bottom-10).
 */
export const ViewportControls: React.FC<SceneFlags> = (flags) => {
  const orthographic = useAppStore(s => s.orthographic);
  const viewCube = useAppStore(s => s.viewCube);
  const setLastViewpoint = useAppStore(s => s.setLastViewpoint);
  const camera = useThree(s => s.camera);
  const controls = useThree(s => s.controls) as OrbitControlsImpl | null;
  const bounds = useAssemblyBounds(flags);
  const centerRef = useRef(bounds.center);
  centerRef.current = bounds.center;

  const orbitDistanceRef = useRef(150);
  const controlsRef = useRef(controls);
  controlsRef.current = controls;

  useFrame(() => {
    orbitDistanceRef.current = camera.position.distanceTo(centerRef.current);
  });

  /** Record where the viewport ended up, so secondary views (the Decode
   *  corner preview) can adopt the angle rather than inventing their own.
   *  Direction and target only — distance belongs to whoever renders it. */
  const recordViewpoint = useCallback(() => {
    const target = controlsRef.current?.target ?? centerRef.current;
    const offset = camera.position.clone().sub(target);
    if (offset.lengthSq() < 1e-6) return;
    offset.normalize();
    setLastViewpoint({
      direction: [offset.x, offset.y, offset.z],
      target: [target.x, target.y, target.z],
    });
  }, [camera, setLastViewpoint]);

  /** Correct gizmo snap radius + refresh controls (incl. ortho projection). */
  const handleGizmoUpdate = useCallback(() => {
    const center = centerRef.current;
    const dist = orbitDistanceRef.current;

    const offset = camera.position.clone().sub(center);
    if (offset.lengthSq() > 1e-6) {
      offset.normalize().multiplyScalar(dist);
      camera.position.copy(center).add(offset);
    }

    if (camera instanceof THREE.OrthographicCamera) {
      camera.updateProjectionMatrix();
    }

    controlsRef.current?.update();
    recordViewpoint();
  }, [camera, recordViewpoint]);

  return (
    <>
      <OrbitControls
        key={orthographic ? 'ortho' : 'persp'}
        makeDefault
        camera={camera}
        target={bounds.center}
        mouseButtons={{
          LEFT: undefined as unknown as THREE.MOUSE,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
        onEnd={recordViewpoint}
      />
      <OrbitTargetSync center={bounds.center} />
      {/* Off by default at phone widths, where it parks in a corner of an
          already small canvas — Preferences turns it back on. */}
      {viewCube && (
        <GizmoHelper
          alignment="bottom-right"
          margin={[72, 92]}
          onTarget={() => centerRef.current.clone()}
          onUpdate={handleGizmoUpdate}
        >
          <GizmoViewcube />
        </GizmoHelper>
      )}
    </>
  );
};
