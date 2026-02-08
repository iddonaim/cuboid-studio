import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { CUBE_VARIATIONS } from '../../lib/cube/specifications';
import { CUBE_SIZE, GRID_STRIDE } from '../../lib/cube/constants';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useAppStore } from '../../store/useAppStore';
import { SpatialGrid } from './SpatialGrid';
import { CubeWithCuts } from './CubeWithCuts';
import { FaceHoverInfo } from '../../lib/cube/types';
import { useMemeStore } from '../../store/useMemeStore';

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

/** Pataphysical mode scene — single working cube from meme store */
const PataphysicalScene: React.FC = () => {
  const workingGeometry = useMemeStore(s => s.workingGeometry);
  const lastCutterGeometry = useMemeStore(s => s.lastCutterGeometry);
  const cutterVisible = useMemeStore(s => s.cutterVisible);

  const edgesGeometry = React.useMemo(() => {
    if (!workingGeometry) return null;
    return new THREE.EdgesGeometry(workingGeometry, 15);
  }, [workingGeometry]);

  const cutterEdgesGeometry = React.useMemo(() => {
    if (!lastCutterGeometry) return null;
    return new THREE.EdgesGeometry(lastCutterGeometry, 1);
  }, [lastCutterGeometry]);

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

          {/* Cutter wireframe overlay */}
          {cutterVisible && lastCutterGeometry && cutterEdgesGeometry && (
            <>
              <mesh geometry={lastCutterGeometry} position={[-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2]}>
                <meshBasicMaterial color="#ef4444" transparent opacity={0.08} side={THREE.DoubleSide} />
              </mesh>
              <lineSegments geometry={cutterEdgesGeometry} position={[-CUBE_SIZE / 2, -CUBE_SIZE / 2, -CUBE_SIZE / 2]}>
                <lineBasicMaterial color="#ef4444" linewidth={1} transparent opacity={0.6} />
              </lineSegments>
            </>
          )}
        </group>
      )}
    </>
  );
};

export const Viewport3D: React.FC = () => {
  const activeMode = useAppStore(s => s.activeMode);

  return (
    <Canvas
      camera={{ position: [150, 150, 150], fov: 50 }}
      style={{ background: '#f1f5f9' }}
      gl={{ localClippingEnabled: true }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[50, 50, 50]} intensity={0.8} />
      <OrbitControls
        mouseButtons={{
          LEFT: undefined as any,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
      />

      {activeMode === 'builder' && <BuilderScene />}
      {activeMode === 'pataphysical' && <PataphysicalScene />}
    </Canvas>
  );
};
