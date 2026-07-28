/**
 * Connection-law violation markers.
 *
 * Draws a quiet "refused joint" notation — a square with a cross through it —
 * at every adjacency the connection law refuses. Nothing here changes the
 * assembly: the markers are an annotation layer laid over the drawing, the way
 * a correction is laid over a plan.
 *
 * They live in the 3D scene rather than the DOM on purpose, so a viewport
 * capture takes them along into the plate (`SceneCapture` renders the whole
 * scene). That is deliberate — a captured sheet showing where the engine broke
 * the law is evidence of the judgment, not a defect in the drawing.
 *
 * Drawn over the geometry (`depthTest: false`) so a marker buried inside an
 * assembly is still legible; in ink rather than the accent or a warning red,
 * because this is information for judgment, not an error state.
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { CUBE_SIZE } from '../../lib/cube/constants';
import {
  CheckableCube,
  ConnectionViolation,
  findConnectionViolations,
} from '../../lib/cube/connectionViolations';

/** ink-600 from the drafting-instrument ramp — reads as annotation, not alarm. */
const MARKER_COLOR = '#5D5A50';

/** Half-extent of the marker square: inside the 42mm face, so it reads as a
 *  marking on the joint rather than an outline of it. */
const HALF = CUBE_SIZE * 0.42;

/** Square + cross, in the XY plane (normal +Z). Rotated per axis at use. */
const MARKER_GEOMETRY = (() => {
  const s = HALF;
  const points: number[] = [
    // border
    -s, -s, 0, s, -s, 0,
    s, -s, 0, s, s, 0,
    s, s, 0, -s, s, 0,
    -s, s, 0, -s, -s, 0,
    // cross
    -s, -s, 0, s, s, 0,
    -s, s, 0, s, -s, 0,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
})();

/** Rotation that turns the XY-plane marker to face along each separation axis. */
const AXIS_ROTATION: Record<ConnectionViolation['axis'], [number, number, number]> = {
  x: [0, Math.PI / 2, 0],
  y: [Math.PI / 2, 0, 0],
  z: [0, 0, 0],
};

const noRaycast = () => null;

interface ConnectionViolationMarkersProps {
  /** The assembly to check. Violations are derived here and never stored. */
  cubes: CheckableCube[];
  /** Dim the markers when the layer they annotate is itself ghosted. */
  opacity?: number;
}

export const ConnectionViolationMarkers: React.FC<ConnectionViolationMarkersProps> = ({
  cubes,
  opacity = 0.9,
}) => {
  const violations = useMemo(() => findConnectionViolations(cubes), [cubes]);

  if (violations.length === 0) return null;

  return (
    <>
      {violations.map(violation => (
        <lineSegments
          key={violation.key}
          geometry={MARKER_GEOMETRY}
          position={violation.interfacePosition}
          rotation={AXIS_ROTATION[violation.axis]}
          renderOrder={999}
          raycast={noRaycast}
        >
          <lineBasicMaterial
            color={MARKER_COLOR}
            transparent
            opacity={opacity}
            depthTest={false}
            depthWrite={false}
          />
        </lineSegments>
      ))}
    </>
  );
};
