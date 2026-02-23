import React, { useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { CUBE_SIZE } from '../../lib/cube/constants';
import { CubeVariation } from '../../lib/cube/specifications';
import { Rotation, DEFAULT_ROTATION } from '../../lib/cube/connectionRules';
import { getVariationGeometryAsync } from '../../lib/cube/csgUtils';
import { FaceHoverInfo } from '../../lib/cube/types';
import { getAdjacentPositionAndFace } from '../../lib/cube/placement';

interface CubeWithCutsProps {
  variation: CubeVariation;
  position: [number, number, number];
  rotation?: Rotation;
  opacity?: number;
  selected?: boolean;
  targeted?: boolean;
  validPlacement?: boolean | null;
  onClick?: () => void;
  onFaceHover?: (info: FaceHoverInfo | null) => void;
  isPreview?: boolean;
  clippingPlanes?: THREE.Plane[];
  overrideGeometry?: THREE.BufferGeometry | null;
}

export const CubeWithCuts: React.FC<CubeWithCutsProps> = ({
  variation,
  position,
  rotation = DEFAULT_ROTATION,
  opacity = 1,
  selected,
  targeted,
  validPlacement,
  onClick,
  onFaceHover,
  isPreview = false,
  clippingPlanes,
  overrideGeometry,
}) => {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    // If override geometry is provided, use it directly
    if (overrideGeometry) {
      setGeometry(overrideGeometry);
      return;
    }

    let cancelled = false;

    const loadGeometry = async () => {
      try {
        const geo = await getVariationGeometryAsync(variation);
        if (!cancelled) {
          setGeometry(geo);
        }
      } catch (error) {
        console.error(`Failed to load geometry for ${variation.id}:`, error);
        if (!cancelled) {
          setGeometry(new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE));
        }
      }
    };

    loadGeometry();
    return () => { cancelled = true; };
  }, [variation, overrideGeometry]);

  const geometryOffset: [number, number, number] = [
    -CUBE_SIZE / 2,
    -CUBE_SIZE / 2,
    -CUBE_SIZE / 2,
  ];

  const yRotationRad = (rotation.y * Math.PI) / 2;
  const xRotationRad = (rotation.x * Math.PI) / 2;

  const noRaycast = isPreview ? () => null : undefined;

  // Shared logic: compute adjacent position from a face intersection and
  // propagate via onFaceHover.  Used by both pointerMove (mouse hover) and
  // pointerDown (touch — there is no hover phase on touch devices, so we
  // must resolve the face on the initial touch before onClick fires).
  const handleFaceDetect = (e: any) => {
    if (isPreview || !onFaceHover) return;
    e.stopPropagation();
    if (e.face?.normal) {
      const { position: adjPos, face } = getAdjacentPositionAndFace(position, e.face.normal);
      onFaceHover({
        adjacentPosition: adjPos,
        existingCubeFace: face,
        existingVariationId: variation.id,
        existingRotation: rotation,
      });
    }
  };

  const edgesGeometry = useMemo(() => {
    if (!geometry) return null;
    return new THREE.EdgesGeometry(geometry, 15);
  }, [geometry]);

  let fillColor = '#ffffff';
  let edgeColor = '#000000';

  if (targeted) {
    fillColor = '#fff7e0';
    edgeColor = '#d97706';
  }
  if (selected) {
    fillColor = '#e0e0ff';
    edgeColor = '#4444ff';
  }
  if (validPlacement === true) {
    fillColor = '#b8f5b8';
    edgeColor = '#15803d';
  }
  if (validPlacement === false) {
    fillColor = '#ffe0e0';
    edgeColor = '#ef4444';
  }

  if (!geometry || !edgesGeometry) return null;

  return (
    <group
      position={position}
      rotation={[xRotationRad, yRotationRad, 0]}
      onClick={isPreview ? undefined : (e) => { e.stopPropagation(); onClick?.(); }}
      onPointerDown={handleFaceDetect}
      onPointerMove={handleFaceDetect}
      onPointerOut={isPreview ? undefined : () => onFaceHover?.(null)}
    >
      <mesh geometry={geometry} position={geometryOffset} raycast={noRaycast}>
        <meshBasicMaterial
          color={fillColor}
          transparent={opacity < 1}
          opacity={opacity}
          side={THREE.FrontSide}
          clippingPlanes={clippingPlanes || []}
        />
      </mesh>
      {clippingPlanes && clippingPlanes.length > 0 && (
        <mesh geometry={geometry} position={geometryOffset} raycast={noRaycast}>
          <meshBasicMaterial
            color="#404040"
            side={THREE.BackSide}
            clippingPlanes={clippingPlanes}
          />
        </mesh>
      )}
      <lineSegments geometry={edgesGeometry} position={geometryOffset} raycast={noRaycast}>
        <lineBasicMaterial
          color={edgeColor}
          linewidth={2}
          transparent={opacity < 1}
          opacity={opacity}
          clippingPlanes={clippingPlanes || []}
        />
      </lineSegments>
    </group>
  );
};
