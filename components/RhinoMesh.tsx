import React, { useMemo, useEffect } from 'react';
import { Edges } from '@react-three/drei';
import * as THREE from 'three';
import { MeshVariation } from '../types';
import { createGeometryFromRhinoMesh } from '../services/rhinoMeshLoader';

interface RhinoMeshProps {
  variation: MeshVariation;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  onClick?: () => void;
  isSelected?: boolean;
}

const RhinoMesh: React.FC<RhinoMeshProps> = ({ 
  variation, 
  position = [0, 0, 0], 
  rotation = [0, 0, 0], 
  scale = 1,
  onClick,
  isSelected
}) => {
  const cubeColor = isSelected ? '#ffffff' : '#334155';
  const edgeColor = isSelected ? '#6366f1' : '#1e293b';

  // Create Three.js geometry from Rhino mesh data
  const geometry = useMemo(() => {
    return createGeometryFromRhinoMesh(variation.meshData);
  }, [variation.meshData]);

  // Dispose geometry on unmount or when variation changes
  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <group position={position} rotation={rotation} scale={scale} onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
      {/* Main Mesh with Edges */}
      <mesh geometry={geometry}>
        <meshBasicMaterial 
          color={cubeColor} 
          wireframe 
          transparent 
          opacity={0.15} 
        />
        <Edges geometry={geometry} color={edgeColor} threshold={15} />
      </mesh>

      {/* Selection Glow */}
      {isSelected && (
        <group>
          <mesh geometry={geometry}>
            <meshBasicMaterial color="#6366f1" transparent opacity={0.08} />
          </mesh>
          {/* Axis indicators for selected module */}
          <gridHelper args={[50, 4, '#6366f1', '#1e293b']} rotation={[Math.PI/2, 0, 0]} />
        </group>
      )}
    </group>
  );
};

export default RhinoMesh;
