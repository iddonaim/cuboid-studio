import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { CUBE_SIZE } from '../../lib/cube/constants';
import { CUBE_VARIATIONS } from '../../lib/cube/specifications';
import { assemblyBoundsFromPositions, AssemblyBounds } from '../../lib/viewport/assemblyBounds';
import { useClippingPlanes } from '../../hooks/useClippingPlanes';
import { useAppStore } from '../../store/useAppStore';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useDecodeStore } from '../../store/useDecodeStore';
import { useMemeStore } from '../../store/useMemeStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { CubeWithCuts } from '../viewport/CubeWithCuts';

/** Where the preview looks from before the 3D viewport has been used. */
const DEFAULT_DIRECTION = new THREE.Vector3(1, 0.85, 1).normalize();

/**
 * Aims the preview camera at the assembly from the recorded direction and
 * refits whenever the assembly, the angle or the box changes. Distance is
 * always the preview's own — a framing chosen on a full-bleed canvas means
 * nothing in a 224px thumbnail, and adopting it would routinely put the
 * assembly outside the frustum.
 */
const PreviewCamera: React.FC<{
  bounds: AssemblyBounds;
  direction: THREE.Vector3;
  target: THREE.Vector3;
  orthographic: boolean;
}> = ({ bounds, direction, target, orthographic }) => {
  const persp = useRef<THREE.PerspectiveCamera>(null);
  const ortho = useRef<THREE.OrthographicCamera>(null);
  const size = useThree(s => s.size);
  const aspect = size.width / Math.max(size.height, 1);

  // The floor only guards the degenerate single-cube case — set it any higher
  // and small assemblies get shoved into the distance and render as a speck.
  const distance = Math.max(bounds.halfExtent * 3.6, CUBE_SIZE * 2.5);

  useEffect(() => {
    const camera = orthographic ? ortho.current : persp.current;
    if (!camera) return;
    camera.position.copy(direction).multiplyScalar(distance).add(target);
    camera.lookAt(target);
    if (camera instanceof THREE.OrthographicCamera) {
      // Deliberately not the viewport's fitOrthoFrustum: that one floors the
      // frustum at the empty-scene extent so a blank canvas still shows a
      // sensible patch of grid, which in a thumbnail shrinks any real assembly
      // to a speck. The preview never renders empty, so it fits tight. The
      // 1.6 covers a box seen corner-on, whose projected width exceeds its
      // longest side.
      const span = Math.max(
        bounds.max.x - bounds.min.x,
        bounds.max.y - bounds.min.y,
        bounds.max.z - bounds.min.z,
      ) * 1.6;
      const halfW = (aspect >= 1 ? span * aspect : span) / 2;
      const halfH = (aspect >= 1 ? span : span / aspect) / 2;
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      // near negative, CAD convention — nothing vanishes when the camera
      // plane passes through the model.
      camera.far = Math.max(20000, span * 12);
      camera.near = -camera.far;
      camera.updateProjectionMatrix();
    } else {
      camera.aspect = aspect;
      camera.far = Math.max(distance * 4, 20000);
      camera.updateProjectionMatrix();
    }
  }, [orthographic, direction, target, distance, bounds, aspect]);

  return orthographic ? (
    <OrthographicCamera ref={ortho} makeDefault />
  ) : (
    <PerspectiveCamera ref={persp} makeDefault fov={40} near={1} />
  );
};

/**
 * The assembly, small, in the corner of the notation sheet.
 *
 * A canvas of its own rather than a resized Viewport3D: the main viewport owns
 * camera state, orbit controls and the screenshot-capture registration, and
 * shrinking it into a thumbnail drags all of that along — the camera comes back
 * framed for a 240px box.
 *
 * It has no controls of its own, deliberately. It mirrors the real viewport:
 * the angle you last left it at, its projection, and its section cut. Set the
 * view up once in the place built for it, then draw against it. Clicking the
 * preview opens that viewport.
 *
 * Sits bottom-right — the stage's left is under the docked sidebar, which
 * would swallow both the picture and the click.
 */
export const DecodeAssemblyPreview: React.FC = () => {
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const cubeGeometryOverrides = useMemeStore(s => s.cubeGeometryOverrides);
  const setStageView = useDecodeStore(s => s.setStageView);
  const orthographic = useAppStore(s => s.orthographic);
  const lastViewpoint = useAppStore(s => s.lastViewpoint);
  const clippingPlanes = useClippingPlanes();
  const isMobile = useIsMobile();

  const bounds = useMemo(
    () => assemblyBoundsFromPositions(placedCubes.map(c => c.position)),
    [placedCubes],
  );

  const direction = useMemo(
    () =>
      lastViewpoint
        ? new THREE.Vector3(...lastViewpoint.direction).normalize()
        : DEFAULT_DIRECTION.clone(),
    [lastViewpoint],
  );
  const target = useMemo(
    () => (lastViewpoint ? new THREE.Vector3(...lastViewpoint.target) : bounds.center.clone()),
    [lastViewpoint, bounds.center],
  );

  if (placedCubes.length === 0) return null;

  return (
    <button
      type="button"
      onClick={() => setStageView('model')}
      title="Open the 3D assembly — orbit and section it there, and this follows"
      aria-label="Open the 3D assembly"
      // Smaller on a phone: 224px is 57% of a 390px screen, and at that size it
      // both swallowed the sheet it sits on and collided with the help pill.
      className={`absolute bottom-14 right-3 z-10 overflow-hidden rounded-lg border border-ink-200 bg-ink-50/90 p-0 shadow-[0_4px_20px_hsl(45_9%_13%/0.12)] backdrop-blur-sm cursor-pointer hover:border-ink-300 ${
        isMobile ? 'h-[105px] w-[140px]' : 'h-[168px] w-[224px]'
      }`}
    >
      <Canvas
        // The sheet owns the pointer; the preview is a picture you click.
        style={{ pointerEvents: 'none', background: 'transparent' }}
        // localClippingEnabled so the section cut carries into the thumbnail,
        // poché and all — matching the viewport it mirrors.
        gl={{ alpha: true, antialias: true, localClippingEnabled: true }}
        dpr={[1, 2]}
      >
        <PreviewCamera
          bounds={bounds}
          direction={direction}
          target={target}
          orthographic={orthographic}
        />
        <ambientLight intensity={0.6} />
        <directionalLight position={[50, 50, 50]} intensity={0.8} />
        {placedCubes.map(cube => {
          const variation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
          if (!variation) return null;
          return (
            <CubeWithCuts
              key={cube.id}
              variation={variation}
              position={cube.position}
              rotation={cube.rotation}
              overrideGeometry={cubeGeometryOverrides[cube.id] ?? null}
              clippingPlanes={clippingPlanes}
              isPreview
            />
          );
        })}
      </Canvas>
      {/* Dropped on the phone: at 140px the caption lands on the assembly
          itself, and the TopBar already carries the same count. */}
      {!isMobile && (
        <span className="pointer-events-none absolute bottom-1 right-2 font-mono text-[9px] uppercase tracking-wider text-ink-500">
          {placedCubes.length} cubes
        </span>
      )}
    </button>
  );
};
