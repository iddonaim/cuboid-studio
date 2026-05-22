import React, { useMemo, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  registerCaptureFunction,
  unregisterCaptureFunction,
} from '../../lib/capture/screenshotCapture';
import { CUBE_VARIATIONS } from '../../lib/cube/specifications';
import { CUBE_SIZE, GRID_STRIDE } from '../../lib/cube/constants';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useAppStore } from '../../store/useAppStore';
import { SpatialGrid } from './SpatialGrid';
import { CubeWithCuts } from './CubeWithCuts';
import { FaceHoverInfo } from '../../lib/cube/types';
import { useMemeStore } from '../../store/useMemeStore';
import { useEncodingStore } from '../../store/useEncodingStore';
import { useEvolutionStore } from '../../store/useEvolutionStore';

/** Builder mode scene contents */
const BuilderScene: React.FC = () => {
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const selectedCubeId = useBuilderStore(s => s.selectedCubeId);
  const setSelectedCubeId = useBuilderStore(s => s.setSelectedCubeId);
  const hoverPos = useBuilderStore(s => s.hoverPos);
  const setHoverPos = useBuilderStore(s => s.setHoverPos);
  const setHoverInfo = useBuilderStore(s => s.setHoverInfo);
  const pickerActive = useBuilderStore(s => s.pickerActive);
  const setPickerActive = useBuilderStore(s => s.setPickerActive);
  const rulesEnabled = useBuilderStore(s => s.rulesEnabled);
  const sectionEnabled = useBuilderStore(s => s.sectionEnabled);
  const sectionAxis = useBuilderStore(s => s.sectionAxis);
  const sectionPosition = useBuilderStore(s => s.sectionPosition);
  const handlePlace = useBuilderStore(s => s.handlePlace);
  const selectedIdx = useBuilderStore(s => s.selectedIdx);
  const previewRotation = useBuilderStore(s => s.previewRotation);

  // Compute these outside of Zustand selectors to avoid infinite re-render loops
  // (getSelectedVariation/getPlacementValidity return new objects each call)
  const selectedVariation = useMemo(() => CUBE_VARIATIONS[selectedIdx], [selectedIdx]);
  const placementValidity = useMemo(
    () => useBuilderStore.getState().getPlacementValidity(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hoverPos, previewRotation, placedCubes, rulesEnabled]
  );

  // Track pointer-down position so we can distinguish a tap from an orbit drag.
  // If the finger moves more than 8px between down and up, it's a drag — skip placement.
  const pointerDownXY = useRef<{ x: number; y: number } | null>(null);

  const clippingPlanes = useMemo(() => {
    if (!sectionEnabled) return [];
    const normal = new THREE.Vector3(
      sectionAxis === 'x' ? -1 : 0,
      sectionAxis === 'y' ? -1 : 0,
      sectionAxis === 'z' ? -1 : 0
    );
    return [new THREE.Plane(normal, sectionPosition)];
  }, [sectionEnabled, sectionAxis, sectionPosition]);

  return (
    <>
      <SpatialGrid size={7} levels={4} />

      {/* Placed cubes */}
      {placedCubes.map(cube => {
        const variation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
        if (!variation) return null;
        return (
          <CubeWithCuts
            key={cube.id}
            variation={variation}
            position={cube.position}
            rotation={cube.rotation}
            selected={cube.id === selectedCubeId}
            clippingPlanes={clippingPlanes}
            onClick={() => {
              if (selectedCubeId === cube.id) {
                setSelectedCubeId(null);
              } else if (!hoverPos) {
                setSelectedCubeId(cube.id);
              } else {
                handlePlace();
              }
            }}
            onFaceHover={(info: FaceHoverInfo | null) => {
              if (pickerActive && !selectedCubeId) {
                if (info) {
                  setHoverPos(info.adjacentPosition);
                  setHoverInfo(info);
                } else {
                  setHoverInfo(null);
                }
              }
            }}
          />
        );
      })}

      {/* Hover preview */}
      {pickerActive && hoverPos && !selectedCubeId && (
        <CubeWithCuts
          variation={selectedVariation}
          position={hoverPos}
          rotation={placementValidity.rotation}
          opacity={0.8}
          validPlacement={rulesEnabled ? placementValidity.valid : null}
          isPreview
        />
      )}

      {/* Ground click plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(e) => {
          pointerDownXY.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!pickerActive) return;
          e.stopPropagation();
          const x = Math.round(e.point.x / GRID_STRIDE) * GRID_STRIDE;
          const z = Math.round(e.point.z / GRID_STRIDE) * GRID_STRIDE;
          setHoverPos([x, CUBE_SIZE / 2, z]);
          setHoverInfo(null);
        }}
        onPointerOut={() => {
          setHoverPos(null);
          setHoverInfo(null);
        }}
        onClick={(e) => {
          // Ignore if the pointer moved significantly — that's an orbit drag, not a tap
          if (pointerDownXY.current) {
            const dx = e.clientX - pointerDownXY.current.x;
            const dy = e.clientY - pointerDownXY.current.y;
            if (dx * dx + dy * dy > 64) return; // 8 px threshold
          }
          e.stopPropagation();
          if (!pickerActive) {
            setPickerActive(true);
            return;
          }
          if (!selectedCubeId) handlePlace();
        }}
      >
        <planeGeometry args={[500, 500]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  );
};

/** Cutter wireframe overlay — shared between standalone and assembly modes */
const CutterOverlay: React.FC<{ offset: [number, number, number] }> = ({ offset }) => {
  const lastCutterGeometry = useMemeStore(s => s.lastCutterGeometry);
  const cutterVisible = useMemeStore(s => s.cutterVisible);

  const cutterEdgesGeometry = React.useMemo(() => {
    if (!lastCutterGeometry) return null;
    return new THREE.EdgesGeometry(lastCutterGeometry, 1);
  }, [lastCutterGeometry]);

  if (!cutterVisible || !lastCutterGeometry || !cutterEdgesGeometry) return null;

  return (
    <>
      <mesh geometry={lastCutterGeometry} position={offset}>
        <meshBasicMaterial color="#ef4444" transparent opacity={0.08} side={THREE.DoubleSide} />
      </mesh>
      <lineSegments geometry={cutterEdgesGeometry} position={offset}>
        <lineBasicMaterial color="#ef4444" linewidth={1} transparent opacity={0.6} />
      </lineSegments>
    </>
  );
};

/** Standalone pataphysical scene — single working cube, no assembly */
const StandalonePataphysicalScene: React.FC = () => {
  const workingGeometry = useMemeStore(s => s.workingGeometry);

  const edgesGeometry = React.useMemo(() => {
    if (!workingGeometry) return null;
    return new THREE.EdgesGeometry(workingGeometry, 15);
  }, [workingGeometry]);

  return (
    <>
      <SpatialGrid size={3} levels={2} />
      {workingGeometry && edgesGeometry && (
        <group position={[0, CUBE_SIZE / 2, 0]}>
          <mesh geometry={workingGeometry} position={[-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2]}>
            <meshBasicMaterial color="#ffffff" side={THREE.FrontSide} />
          </mesh>
          <lineSegments geometry={edgesGeometry} position={[-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2]}>
            <lineBasicMaterial color="#000000" linewidth={2} />
          </lineSegments>
          <CutterOverlay offset={[-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2]} />
        </group>
      )}
    </>
  );
};

/** Assembly pataphysical scene — builder cubes with per-cube meme overrides */
const AssemblyPataphysicalScene: React.FC = () => {
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const targetCubeId = useMemeStore(s => s.targetCubeId);
  const setTargetCubeId = useMemeStore(s => s.setTargetCubeId);
  const cubeGeometryOverrides = useMemeStore(s => s.cubeGeometryOverrides);

  // Find the targeted cube's position for the cutter overlay
  const targetCube = placedCubes.find(c => c.id === targetCubeId);

  return (
    <>
      <SpatialGrid size={7} levels={4} />

      {/* Render all placed cubes, with overrides where they exist */}
      {placedCubes.map(cube => {
        const variation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
        if (!variation) return null;
        const override = cubeGeometryOverrides[cube.id] || null;
        return (
          <CubeWithCuts
            key={cube.id}
            variation={variation}
            position={cube.position}
            rotation={cube.rotation}
            overrideGeometry={override}
            targeted={cube.id === targetCubeId}
            onClick={() => {
              setTargetCubeId(cube.id === targetCubeId ? null : cube.id);
            }}
          />
        );
      })}

      {/* Cutter wireframe at targeted cube's position */}
      {targetCube && (
        <group
          position={targetCube.position}
          rotation={[
            (targetCube.rotation.x * Math.PI) / 2,
            (targetCube.rotation.y * Math.PI) / 2,
            0,
          ]}
        >
          <CutterOverlay offset={[-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2]} />
        </group>
      )}

      {/* Click-away plane to deselect */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e) => {
          e.stopPropagation();
          setTargetCubeId(null);
        }}
      >
        <planeGeometry args={[500, 500]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  );
};

/** Pataphysical mode scene — assembly if cubes exist, standalone otherwise */
const PataphysicalScene: React.FC = () => {
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const hasAssembly = placedCubes.length > 0;

  return hasAssembly ? <AssemblyPataphysicalScene /> : <StandalonePataphysicalScene />;
};

/** Encoding mode scene — preview of encoded assembly before loading into builder */
const EncodingScene: React.FC = () => {
  const encodedCubes = useEncodingStore(s => s.encodedCubes);
  const seedCubes = useEncodingStore(s => s.seedCubes);
  const mode = useEncodingStore(s => s.mode);

  const hasSeed = mode !== 'standalone' && seedCubes.length > 0;
  const hasEncoded = encodedCubes && encodedCubes.length > 0;

  if (!hasSeed && !hasEncoded) {
    return <SpatialGrid size={3} levels={2} />;
  }

  return (
    <>
      <SpatialGrid size={7} levels={4} />

      {/* Seed cubes — only in merge/remix mode */}
      {hasSeed && seedCubes.map((cube, i) => {
        const variation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
        if (!variation) return null;
        return (
          <CubeWithCuts
            key={`seed-${i}`}
            variation={variation}
            position={cube.position}
            rotation={cube.rotation}
            provenance="preserved"
          />
        );
      })}

      {/* Encoded (added) cubes */}
      {hasEncoded && encodedCubes.map((cube, i) => {
        const variation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
        if (!variation) return null;
        return (
          <CubeWithCuts
            key={`enc-${i}`}
            variation={variation}
            position={cube.position}
            rotation={{
              x: (cube.rotation.x as 0 | 1 | 2 | 3) || 0,
              y: (cube.rotation.y as 0 | 1 | 2 | 3) || 0,
            }}
            provenance="added"
          />
        );
      })}
    </>
  );
};

/**
 * Evolution mode scene — shows assembly with the currently previewed
 * candidate's target cube highlighted in amber.  When a candidate is
 * selected, shows a wireframe preview of the cutter that would be applied.
 * Geometry overrides from previous pataphysical operations are preserved.
 */
const EvolutionScene: React.FC = () => {
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const cubeGeometryOverrides = useMemeStore(s => s.cubeGeometryOverrides);
  const previewCandidateId = useEvolutionStore(s => s.previewCandidateId);
  const candidates = useEvolutionStore(s => s.candidates);

  // Find which cube the previewed candidate targets
  const previewedCandidate = candidates.find(c => c.id === previewCandidateId);
  const highlightCubeId = previewedCandidate?.targetCubeId ?? null;
  const previewTargetCube = placedCubes.find(c => c.id === highlightCubeId);

  // Generate a cutter wireframe preview for the selected candidate
  const cutterPreview = useMemo(() => {
    if (!previewedCandidate || !previewTargetCube) return null;
    try {
      const bbox = new THREE.Box3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE)
      );
      const { type, proportions, position, rotation } = previewedCandidate.cutterConfig.cutter;
      const scale = Math.max(0.05, Math.min(previewedCandidate.cutterConfig.magnitude, 1.0));
      const p = proportions.map(v => Math.max(0.01, Math.min(v, 2.0))) as [number, number, number];

      let geo: THREE.BufferGeometry;
      switch (type) {
        case 'sphere':
          geo = new THREE.SphereGeometry(p[0] * CUBE_SIZE * scale * 0.5, 16, 16);
          break;
        case 'cylinder':
          geo = new THREE.CylinderGeometry(p[0] * CUBE_SIZE * scale * 0.5, p[0] * CUBE_SIZE * scale * 0.5, p[1] * CUBE_SIZE * scale, 16);
          break;
        case 'plane':
          geo = new THREE.BoxGeometry(p[0] * CUBE_SIZE * scale, 0.5, p[2] * CUBE_SIZE * scale);
          break;
        default:
          geo = new THREE.BoxGeometry(p[0] * CUBE_SIZE * scale, p[1] * CUBE_SIZE * scale, p[2] * CUBE_SIZE * scale);
      }

      const center = new THREE.Vector3();
      bbox.getCenter(center);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const pos = position.map(v => Math.max(-1, Math.min(v, 1))) as [number, number, number];

      const matrix = new THREE.Matrix4();
      const euler = new THREE.Euler(
        (rotation[0] * Math.PI) / 180,
        (rotation[1] * Math.PI) / 180,
        (rotation[2] * Math.PI) / 180,
        'XYZ'
      );
      matrix.makeRotationFromEuler(euler);
      matrix.setPosition(
        center.x + pos[0] * (size.x / 2),
        center.y + pos[1] * (size.y / 2),
        center.z + pos[2] * (size.z / 2),
      );
      geo.applyMatrix4(matrix);
      return geo;
    } catch {
      return null;
    }
  }, [previewedCandidate, previewTargetCube]);

  const cutterEdges = useMemo(() => {
    if (!cutterPreview) return null;
    return new THREE.EdgesGeometry(cutterPreview, 1);
  }, [cutterPreview]);

  return (
    <>
      <SpatialGrid size={7} levels={4} />

      {placedCubes.map(cube => {
        const variation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
        if (!variation) return null;
        const override = cubeGeometryOverrides[cube.id] || null;
        return (
          <CubeWithCuts
            key={cube.id}
            variation={variation}
            position={cube.position}
            rotation={cube.rotation}
            overrideGeometry={override}
            targeted={cube.id === highlightCubeId}
          />
        );
      })}

      {/* Cutter wireframe preview for selected candidate */}
      {previewTargetCube && cutterPreview && cutterEdges && (
        <group
          position={previewTargetCube.position}
          rotation={[
            (previewTargetCube.rotation.x * Math.PI) / 2,
            (previewTargetCube.rotation.y * Math.PI) / 2,
            0,
          ]}
        >
          <mesh geometry={cutterPreview} position={[-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2]}>
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.1} side={THREE.DoubleSide} />
          </mesh>
          <lineSegments geometry={cutterEdges} position={[-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2]}>
            <lineBasicMaterial color="#f59e0b" linewidth={1} transparent opacity={0.7} />
          </lineSegments>
        </group>
      )}
    </>
  );
};

/** Registers a screenshot capture function with the module-level ref. */
const SceneCapture: React.FC = () => {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    registerCaptureFunction(() => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL('image/png');
    });
    return () => unregisterCaptureFunction();
  }, [gl, scene, camera]);
  return null;
};

export const Viewport3D: React.FC = () => {
  const activeMode       = useAppStore(s => s.activeMode);
  const seedEditOpen     = useEncodingStore(s => s.seedEditOpen);
  const evolutionSubMode = useEvolutionStore(s => s.subMode);

  // Encoding: Builder takes over the scene when the seed-edit overlay is open.
  // Evolution: Pataphysical takes over the scene when its sub-mode is active.
  const showBuilderScene       = activeMode === 'encoding' && seedEditOpen;
  const showEncodingScene      = activeMode === 'encoding' && !seedEditOpen;
  const showPataphysicalScene  = activeMode === 'evolution' && evolutionSubMode === 'pataphysical';
  const showEvolutionScene     = activeMode === 'evolution' && evolutionSubMode === 'evolve';

  return (
    <Canvas
      camera={{ position: [150, 150, 150], fov: 50 }}
      style={{ background: '#f1f5f9' }}
      gl={{ localClippingEnabled: true, preserveDrawingBuffer: true }}
    >
      <SceneCapture />
      <ambientLight intensity={0.6} />
      <directionalLight position={[50, 50, 50]} intensity={0.8} />
      <OrbitControls
        mouseButtons={{
          LEFT: undefined as any,  // left-click used for placement, not orbit
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
        // Touch must be set explicitly: mouseButtons.LEFT=undefined would
        // otherwise disable single-finger orbit on touch screens.
        touches={{
          ONE: THREE.TOUCH.ROTATE,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
      />

      {showBuilderScene       && <BuilderScene />}
      {showEncodingScene      && <EncodingScene />}
      {showPataphysicalScene  && <PataphysicalScene />}
      {showEvolutionScene     && <EvolutionScene />}
    </Canvas>
  );
};
