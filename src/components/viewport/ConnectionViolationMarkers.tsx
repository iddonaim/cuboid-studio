/**
 * Connection-law violation markers — the cubes, not the joints.
 *
 * An earlier version drew a symbol at every refused interface. On a real
 * assembly that is 20+ overlapping symbols drawn through each other, which
 * reads as a scribble rather than a reading. What the architect needs to see is
 * *which cubes sit where the law is broken*, so each of those gets a single
 * outline around it and the panel names the specific pairs.
 *
 * The outline lives in the 3D scene rather than the DOM on purpose, so a
 * viewport capture takes it into the plate (`SceneCapture` renders the whole
 * scene). A captured sheet showing where the engine broke the law is evidence
 * of the judgment, not a defect in the drawing.
 *
 * Depth-tested like everything else — an outline on a cube at the back should
 * be hidden by the cubes in front of it, the same way the cube itself is.
 * Drawn in a violet that no other state in the app uses, so it can't be
 * confused with added-blue, carried-green, discarded-red or the accent, and
 * doesn't read as an alarm.
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { CUBE_SIZE } from '../../lib/cube/constants';
import {
  CheckableCube,
  summarizeConnections,
} from '../../lib/cube/connectionViolations';

/** Distinct from every semantic colour already in use in the viewport. */
const MARKER_COLOR = '#6b4c9a';

/** Just outside the cube's own edges, so the two don't z-fight. */
const MARKER_GEOMETRY = new THREE.EdgesGeometry(
  new THREE.BoxGeometry(CUBE_SIZE * 1.04, CUBE_SIZE * 1.04, CUBE_SIZE * 1.04)
);

const noRaycast = () => null;

interface ConnectionViolationMarkersProps {
  /** The assembly to check. Violations are derived here and never stored. */
  cubes: CheckableCube[];
  /** Dim the outlines when the layer they annotate is itself ghosted. */
  opacity?: number;
}

export const ConnectionViolationMarkers: React.FC<ConnectionViolationMarkersProps> = ({
  cubes,
  opacity = 1,
}) => {
  const flagged = useMemo(() => {
    const { cubeIds } = summarizeConnections(cubes);
    if (cubeIds.size === 0) return [];
    return cubes.filter(cube => cubeIds.has(cube.id));
  }, [cubes]);

  if (flagged.length === 0) return null;

  return (
    <>
      {flagged.map(cube => (
        <lineSegments
          key={cube.id}
          geometry={MARKER_GEOMETRY}
          position={cube.position}
          raycast={noRaycast}
        >
          <lineBasicMaterial
            color={MARKER_COLOR}
            transparent={opacity < 1}
            opacity={opacity}
          />
        </lineSegments>
      ))}
    </>
  );
};
