import React, { useState, useEffect, useMemo } from 'react';
import { useAccent } from '../../contexts/AccentContext';
import { sectionCutColor } from '../../lib/theme/accent';
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
  onClick?: (nativeEvent: MouseEvent) => void;
  onFaceHover?: (info: FaceHoverInfo | null) => void;
  isPreview?: boolean;
  /**
   * Render as a receded reference layer rather than part of the composition:
   * outline-forward, fill barely there, and never occluding what's behind it.
   *
   * Plain `opacity` isn't enough on its own — a white fill at 0.3 over the
   * paper background still reads as a solid white card, and it depth-writes,
   * so it hides the solid layer behind it and looks like the thing in front.
   */
  ghost?: boolean;
  clippingPlanes?: THREE.Plane[];
  overrideGeometry?: THREE.BufferGeometry | null;
  provenance?: 'preserved' | 'added';
  /**
   * A sphere face on this cube meets a cylinder face on a neighbour — the one
   * case where two cutters genuinely disagree, rather than a contact simply
   * closing against an uncut shell. Tints the cube itself; interaction states
   * (targeted, selected, placement preview) still win over it.
   */
  flagged?: boolean;
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
  ghost = false,
  clippingPlanes,
  overrideGeometry,
  provenance,
  flagged = false,
}) => {
  const { accent } = useAccent();
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    // If override geometry is provided, use it directly (clone so CSG updates always re-render)
    if (overrideGeometry) {
      setGeometry(overrideGeometry.clone());
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

  const handlePointerMove = (e: any) => {
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

  // Whether the section plane actually passes through THIS cube. The poché
  // (cut-surface) mesh paints the cube's whole interior and relies on the
  // front faces to hide it; when the plane doesn't slice this cube, that
  // back-side paint z-fights with the fill along silhouettes and bleeds
  // through as colored fringes — so it only mounts while genuinely slicing.
  const planeSlicesCube = useMemo(() => {
    if (!clippingPlanes || clippingPlanes.length === 0) return false;
    const plane = clippingPlanes[0];
    const axisIndex = plane.normal.x !== 0 ? 0 : plane.normal.y !== 0 ? 1 : 2;
    // Solve normal·p + constant = 0 for the plane's coordinate on its axis.
    // Reading `constant` directly would only be right for one of the two cut
    // directions — flipping the section negates both normal and constant.
    const planeCoord = -plane.constant / plane.normal.getComponent(axisIndex);
    return Math.abs(planeCoord - position[axisIndex]) < CUBE_SIZE / 2;
  }, [clippingPlanes, position]);

  // The poché face where a section plane slices the cube, in the user's accent.
  const cutColor = useMemo(() => sectionCutColor(accent), [accent]);

  let fillColor = '#ffffff';
  let edgeColor = '#000000';

  // Model-proposed cubes (post-encode, not yet accepted): azure so they read
  // clearly as "pending" against the paper background and vermilion accents.
  if (provenance === 'added') {
    fillColor = '#e3edf8';
    edgeColor = '#2e6fb2';
  }

  // Two cutters that disagree. Violet is used nowhere else in the viewport, so
  // it can't be read as added-blue, selected, carried or discarded — and it
  // isn't a warning red, because this is a reading rather than an error.
  if (flagged) {
    fillColor = '#ece5f3';
    edgeColor = '#6b4c9a';
  }

  if (targeted) {
    fillColor = '#f9e2d8';
    edgeColor = accent;
  }
  if (selected) {
    fillColor = '#e4e9ef';
    edgeColor = '#3b5a80';
  }
  if (validPlacement === true) {
    fillColor = '#e4efe2';
    edgeColor = '#3d8a4e';
  }
  if (validPlacement === false) {
    fillColor = '#f8e3e0';
    edgeColor = '#b03a2e';
  }

  if (!geometry || !edgesGeometry) return null;

  return (
    <group
      position={position}
      rotation={[xRotationRad, yRotationRad, 0]}
      onClick={isPreview ? undefined : (e) => { e.stopPropagation(); onClick?.(e.nativeEvent as MouseEvent); }}
      onPointerMove={handlePointerMove}
      onPointerOut={isPreview ? undefined : () => onFaceHover?.(null)}
    >
      <mesh geometry={geometry} position={geometryOffset} raycast={noRaycast}>
        <meshBasicMaterial
          color={fillColor}
          transparent={ghost || opacity < 1}
          // A ghost's fill is a hint of volume, not a surface — the outline
          // carries it. depthWrite off so it can never hide the solid layer.
          opacity={ghost ? opacity * 0.22 : opacity}
          depthWrite={!ghost}
          side={THREE.FrontSide}
          clippingPlanes={clippingPlanes || []}
        />
      </mesh>
      {planeSlicesCube && (
        <mesh geometry={geometry} position={geometryOffset} raycast={noRaycast}>
          <meshBasicMaterial
            color={cutColor}
            side={THREE.BackSide}
            clippingPlanes={clippingPlanes}
          />
        </mesh>
      )}
      <lineSegments geometry={edgesGeometry} position={geometryOffset} raycast={noRaycast}>
        <lineBasicMaterial
          color={edgeColor}
          linewidth={2}
          transparent={ghost || opacity < 1}
          opacity={opacity}
          depthWrite={!ghost}
          clippingPlanes={clippingPlanes || []}
        />
      </lineSegments>
    </group>
  );
};
