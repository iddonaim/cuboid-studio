import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { CUBE_SIZE } from '../../lib/cube/constants';
import { CUBE_VARIATIONS } from '../../lib/cube/specifications';
import { assemblyBoundsFromPositions } from '../../lib/viewport/assemblyBounds';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useDecodeStore } from '../../store/useDecodeStore';
import { useMemeStore } from '../../store/useMemeStore';
import { CubeWithCuts } from '../viewport/CubeWithCuts';

/** Bottom-right, above the Fit pill: the left of the stage is under the docked
 *  sidebar, which would swallow both the view and the click.
 *
 *  Isometric-ish direction the preview looks from. Fixed: this is a reference
 *  thumbnail, not a viewport — orbiting it would just be another thing to
 *  reset. Click it to open the real 3D view. */
const VIEW_DIRECTION = new THREE.Vector3(1, 0.85, 1).normalize();

/**
 * The assembly, small, in the corner of the notation sheet.
 *
 * A canvas of its own rather than a resized Viewport3D: the main viewport owns
 * camera state, orbit controls and the screenshot-capture registration, and
 * shrinking it into a thumbnail drags all of that along — the camera comes back
 * framed for a 240px box. This renders the same cubes (cuts included) through a
 * throwaway camera fitted to the assembly, and stays entirely out of the
 * viewport's way.
 */
export const DecodeAssemblyPreview: React.FC = () => {
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const cubeGeometryOverrides = useMemeStore(s => s.cubeGeometryOverrides);
  const setStageView = useDecodeStore(s => s.setStageView);

  const bounds = useMemo(
    () => assemblyBoundsFromPositions(placedCubes.map(c => c.position)),
    [placedCubes],
  );

  // Pull back far enough that the whole assembly clears the frustum, with a
  // little air. The floor only guards the degenerate single-cube case — set
  // any higher and small assemblies get shoved into the distance and render
  // as a speck in the middle of an empty box.
  const distance = Math.max(bounds.halfExtent * 3.6, CUBE_SIZE * 2.5);
  const position = useMemo(
    () => VIEW_DIRECTION.clone().multiplyScalar(distance).add(bounds.center),
    [distance, bounds.center],
  );

  if (placedCubes.length === 0) return null;

  return (
    <button
      type="button"
      onClick={() => setStageView('model')}
      title="Open the 3D assembly"
      aria-label="Open the 3D assembly"
      className="absolute bottom-14 right-3 z-10 h-[168px] w-[224px] overflow-hidden rounded-lg border border-ink-200 bg-ink-50/90 p-0 shadow-[0_4px_20px_hsl(45_9%_13%/0.12)] backdrop-blur-sm cursor-pointer hover:border-ink-300"
    >
      <Canvas
        // The sheet owns the pointer; the preview is a picture you click.
        style={{ pointerEvents: 'none', background: 'transparent' }}
        camera={{ position: position.toArray(), fov: 40, near: 1, far: distance * 4 }}
        onCreated={({ camera }) => camera.lookAt(bounds.center)}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
      >
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
              isPreview
            />
          );
        })}
      </Canvas>
      <span className="pointer-events-none absolute bottom-1 right-2 font-mono text-[9px] uppercase tracking-wider text-ink-500">
        {placedCubes.length} cubes
      </span>
    </button>
  );
};
