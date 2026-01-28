import React, { Suspense, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { CubeVariation, PlacedCube, MeshVariation } from '../types';
import CubeMesh from './CubeMesh';
import RhinoMesh from './RhinoMesh';
import { GRID_STRIDE, CUBE_SIZE } from '../constants';

interface Editor3DProps {
  variations: CubeVariation[];
  meshVariations: MeshVariation[];
  placedCubes: PlacedCube[];
  onPlaceCube: (pos: [number, number, number], variationId: string) => void;
  selectedVariation: CubeVariation | null;
  selectedMeshVariation: MeshVariation | null;
  usingRhinoMeshes: boolean;
  onSelectPlacedCube: (cube: PlacedCube | null) => void;
  selectedPlacedCubeId: string | null;
}

const InteractionPlane: React.FC<{
  onMove: (pos: [number, number, number]) => void;
  onClick: (pos: [number, number, number]) => void;
  onOut: () => void;
}> = ({ onMove, onClick, onOut }) => {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      onPointerMove={(e) => {
        e.stopPropagation();
        const p = e.point;
        const snapped: [number, number, number] = [
          Math.round(p.x / GRID_STRIDE) * GRID_STRIDE,
          Math.round(p.y / GRID_STRIDE) * GRID_STRIDE,
          Math.round(p.z / GRID_STRIDE) * GRID_STRIDE
        ];
        onMove(snapped);
      }}
      onPointerDown={(e) => {
        if (e.button === 0) {
          e.stopPropagation();
          const p = e.point;
          const snapped: [number, number, number] = [
            Math.round(p.x / GRID_STRIDE) * GRID_STRIDE,
            Math.round(p.y / GRID_STRIDE) * GRID_STRIDE,
            Math.round(p.z / GRID_STRIDE) * GRID_STRIDE
          ];
          onClick(snapped);
        }
      }}
      onPointerOut={onOut}
    >
      <planeGeometry args={[10000, 10000]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
};

const Editor3D: React.FC<Editor3DProps> = ({
  variations,
  meshVariations,
  placedCubes,
  onPlaceCube,
  selectedVariation,
  selectedMeshVariation,
  usingRhinoMeshes,
  onSelectPlacedCube,
  selectedPlacedCubeId
}) => {
  const [hoveredPos, setHoveredPos] = useState<[number, number, number] | null>(null);

  const handlePlace = useCallback((pos: [number, number, number]) => {
    const currentVariationId = usingRhinoMeshes
      ? selectedMeshVariation?.id
      : selectedVariation?.id;

    if (!currentVariationId) return;

    const isOccupied = placedCubes.some(c =>
      Math.abs(c.position[0] - pos[0]) < 1 &&
      Math.abs(c.position[1] - pos[1]) < 1 &&
      Math.abs(c.position[2] - pos[2]) < 1
    );
    if (!isOccupied) {
      onPlaceCube(pos, currentVariationId);
    }
  }, [placedCubes, selectedVariation, selectedMeshVariation, usingRhinoMeshes, onPlaceCube]);

  return (
    <div className="w-full h-full bg-[#020617]">
      <Canvas onPointerMissed={() => onSelectPlacedCube(null)}>
        <PerspectiveCamera makeDefault position={[200, 200, 200]} fov={50} far={20000} />

        <OrbitControls
          makeDefault
          mouseButtons={{
            LEFT: undefined,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE
          }}
        />

        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />

        <gridHelper args={[1000, 20, '#475569', '#1e293b']} />

        <Suspense fallback={null}>
          <group>
            {placedCubes.map((cube) => {
              const meshVar = meshVariations.find(v => v.id === cube.variationId);
              if (meshVar) {
                return (
                  <RhinoMesh
                    key={cube.id}
                    variation={meshVar}
                    position={cube.position}
                    rotation={cube.rotation}
                    isSelected={selectedPlacedCubeId === cube.id}
                    onClick={() => onSelectPlacedCube(cube)}
                  />
                );
              }

              const variation = variations.find(v => v.id === cube.variationId);
              if (!variation) return null;

              return (
                <CubeMesh
                  key={cube.id}
                  variation={variation}
                  position={cube.position}
                  rotation={cube.rotation}
                  isSelected={selectedPlacedCubeId === cube.id}
                  onClick={() => onSelectPlacedCube(cube)}
                />
              );
            })}

            <InteractionPlane
              onMove={setHoveredPos}
              onClick={handlePlace}
              onOut={() => setHoveredPos(null)}
            />

            {hoveredPos && (
              <group position={hoveredPos}>
                {usingRhinoMeshes && selectedMeshVariation ? (
                  <>
                    <RhinoMesh variation={selectedMeshVariation} scale={1} isSelected={false} />
                    <mesh>
                      <boxGeometry args={[CUBE_SIZE + 0.1, CUBE_SIZE + 0.1, CUBE_SIZE + 0.1]} />
                      <meshBasicMaterial color="#6366f1" transparent opacity={0.2} wireframe />
                    </mesh>
                  </>
                ) : selectedVariation ? (
                  <>
                    <CubeMesh variation={selectedVariation} scale={1} isSelected={false} />
                    <mesh>
                      <boxGeometry args={[CUBE_SIZE + 0.1, CUBE_SIZE + 0.1, CUBE_SIZE + 0.1]} />
                      <meshBasicMaterial color="#6366f1" transparent opacity={0.2} wireframe />
                    </mesh>
                  </>
                ) : null}
              </group>
            )}
          </group>
        </Suspense>
      </Canvas>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-none">
        <div className="bg-slate-950/80 backdrop-blur-md border border-slate-800 px-6 py-3 rounded-2xl text-slate-400 shadow-2xl flex items-center gap-6 text-[10px] font-black uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <span className="text-indigo-400">L-CLICK</span>
            <span>Insert</span>
          </div>
          <div className="w-px h-3 bg-slate-800"></div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-400">R-CLICK</span>
            <span>Orbit</span>
          </div>
          <div className="w-px h-3 bg-slate-800"></div>
          <div className="text-slate-600 italic">Spatial Stride: {GRID_STRIDE}</div>
        </div>
      </div>
    </div>
  );
};

export default Editor3D;
