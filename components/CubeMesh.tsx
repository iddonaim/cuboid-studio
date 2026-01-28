
import React, { useMemo } from 'react';
import { Edges } from '@react-three/drei';
import { CubeVariation, ConnectorType, FaceKey, BooleanCut } from '../types';
import { COLORS, CUBE_SIZE } from '../constants';

interface CubeMeshProps {
  variation: CubeVariation;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  onClick?: () => void;
  isSelected?: boolean;
}

const BooleanCutter: React.FC<{ cut: BooleanCut; isSelected: boolean }> = ({ cut, isSelected }) => {
  const color = cut.type === 'sphere' ? COLORS[ConnectorType.Sphere] : COLORS[ConnectorType.Cylinder];
  const opacity = isSelected ? 0.6 : 0.2;

  return (
    <mesh position={cut.position} rotation={cut.rotation || [0, 0, 0]}>
      {cut.type === 'sphere' ? (
        <sphereGeometry args={[CUBE_SIZE * 0.25, 12, 12]} />
      ) : (
        <cylinderGeometry args={[CUBE_SIZE * 0.15, CUBE_SIZE * 0.15, CUBE_SIZE * 1.2, 12]} />
      )}
      <meshBasicMaterial 
        color={color} 
        wireframe 
        transparent 
        opacity={opacity} 
      />
    </mesh>
  );
};

const CubeMesh: React.FC<CubeMeshProps> = ({ 
  variation, 
  position = [0, 0, 0], 
  rotation = [0, 0, 0], 
  scale = 1,
  onClick,
  isSelected
}) => {
  const cubeColor = isSelected ? '#ffffff' : '#334155';
  const edgeColor = isSelected ? '#6366f1' : '#1e293b';

  // The "Shell" internal cavity
  const ShellCavity = useMemo(() => {
    const wall = 2;
    return (
      <mesh position={[0, -wall/2, 0]}>
        <boxGeometry args={[CUBE_SIZE - wall*2, CUBE_SIZE - wall, CUBE_SIZE - wall*2]} />
        <meshBasicMaterial color={COLORS[ConnectorType.Shell]} wireframe transparent opacity={0.1} />
      </mesh>
    );
  }, []);

  return (
    <group position={position} rotation={rotation} scale={scale} onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
      {/* Main Cube Cage */}
      <mesh>
        <boxGeometry args={[CUBE_SIZE, CUBE_SIZE, CUBE_SIZE]} />
        <meshBasicMaterial color={cubeColor} wireframe transparent opacity={0.15} />
        <Edges color={edgeColor} />
      </mesh>

      {/* Internal Boolean Objects */}
      {variation.cuts.map((cut, idx) => (
        <BooleanCutter key={idx} cut={cut} isSelected={isSelected || false} />
      ))}

      {/* Shell Effect Visualization */}
      {variation.shellFace && ShellCavity}
      
      {/* Selection Glow */}
      {isSelected && (
        <group>
          <mesh>
            <boxGeometry args={[CUBE_SIZE + 1, CUBE_SIZE + 1, CUBE_SIZE + 1]} />
            <meshBasicMaterial color="#6366f1" transparent opacity={0.05} />
          </mesh>
          {/* Axis indicators for selected module */}
          <gridHelper args={[CUBE_SIZE * 2, 4, '#6366f1', '#1e293b']} rotation={[Math.PI/2, 0, 0]} />
        </group>
      )}
    </group>
  );
};

export default CubeMesh;
