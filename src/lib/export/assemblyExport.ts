/**
 * Assembly Export — Grasshopper Live-Link Foundation
 * ==================================================
 *
 * Serialises the full Cuboid Studio assembly state into a structured JSON
 * format that Grasshopper (or any external tool) can consume.
 *
 * The export includes:
 *   - Every placed cube: position, variation, rotation, cutter indices
 *   - Per-cube operator history: every meme-driven boolean operation applied
 *   - Assembly metadata: grid constants, timestamp, compressibility score
 *
 * Coordinate system (matches Rhino / Grasshopper):
 *   - Units: millimetres
 *   - Grid stride: 42.6 mm (cube 42 mm + gap 0.6 mm)
 *   - Cube origin: corner (0,0,0), extent to (42,42,42)
 *   - Y axis is UP in the 3D viewport, but exported as-is (consumer
 *     can remap if their Rhino scene uses Z-up)
 *
 * Usage from browser:
 *   import { exportAssemblyJSON, downloadAssemblyJSON } from './assemblyExport';
 *   downloadAssemblyJSON();          // triggers file download
 *   const json = exportAssemblyJSON(); // returns the JSON string
 */

import { CUBE_SIZE, CUBE_GAP, GRID_STRIDE } from '../cube/constants';
import { CUBE_VARIATIONS } from '../cube/specifications';
import { PlacedCube } from '../cube/types';
import { OperatorRecord } from '../operators/types';

// ─── Exported data structures ────────────────────────────────────────────

export interface ExportedCube {
  /** Unique cube identifier (e.g. "cube-1705973234567") */
  id: string;
  /** Variation ID, e.g. "v-00" through "v-69" */
  variationId: string;
  /** Which 4 cutter indices (0-7) define this variation */
  cutterIndices: number[];
  /** World-space position [x, y, z] in mm */
  position: [number, number, number];
  /** Grid-space indices [col, level, row] — integer coordinates */
  gridIndex: [number, number, number];
  /** Rotation: y = 0-3 (90° steps around Y), x = 0-3 (90° steps around X) */
  rotation: { x: number; y: number };
  /** Rotation in degrees for direct use in Rhino/GH */
  rotationDegrees: { x: number; y: number };
  /** Per-cube operator history (meme-driven boolean operations) */
  operators: ExportedOperator[];
}

export interface ExportedOperator {
  id: string;
  operator: string;
  targets: string[];
  magnitude: number;
  decay: number;
  memeDescription: string;
  reasoning: string;
  cutter: {
    type: string;
    proportions: [number, number, number];
    position: [number, number, number];
    rotation: [number, number, number];
  };
  createdAt: string;
}

export interface AssemblyExport {
  /** Format version for forwards-compatibility */
  version: 2;
  /** ISO timestamp of export */
  exportedAt: string;
  /** Grid / dimension constants so GH can reconstruct the lattice */
  grid: {
    cubeSize: number;
    cubeGap: number;
    gridStride: number;
    units: 'mm';
  };
  /** Total cube count */
  cubeCount: number;
  /** All placed cubes with full metadata */
  cubes: ExportedCube[];
  /** Assembly bounding box in world coordinates */
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

// ─── Core export function ────────────────────────────────────────────────

/**
 * Reads the current stores and builds a full AssemblyExport object.
 * This is a pure function once given the data — no side effects.
 */
export function buildAssemblyExport(
  placedCubes: PlacedCube[],
  cubeOperators: Record<string, OperatorRecord[]>,
): AssemblyExport {
  // Build exported cubes
  const cubes: ExportedCube[] = placedCubes.map(cube => {
    const variation = CUBE_VARIATIONS.find(v => v.id === cube.variationId);
    const cutterIndices: number[] = variation
      ? [...variation.cutterIndices]
      : [];

    const gridIndex: [number, number, number] = [
      Math.round(cube.position[0] / GRID_STRIDE),
      Math.round(cube.position[1] / GRID_STRIDE),
      Math.round(cube.position[2] / GRID_STRIDE),
    ];

    const ops = cubeOperators[cube.id] || [];
    const exportedOps: ExportedOperator[] = ops.map(op => ({
      id: op.id,
      operator: op.operator,
      targets: op.targets,
      magnitude: op.magnitude,
      decay: op.decay,
      memeDescription: op.memeDescription,
      reasoning: op.reasoning,
      cutter: {
        type: op.cutter.type,
        proportions: op.cutter.proportions,
        position: op.cutter.position,
        rotation: op.cutter.rotation,
      },
      createdAt: op.createdAt,
    }));

    return {
      id: cube.id,
      variationId: cube.variationId,
      cutterIndices,
      position: cube.position,
      gridIndex,
      rotation: { x: cube.rotation.x, y: cube.rotation.y },
      rotationDegrees: { x: cube.rotation.x * 90, y: cube.rotation.y * 90 },
      operators: exportedOps,
    };
  });

  // Compute bounding box
  const positions = placedCubes.map(c => c.position);
  const bounds = {
    min: [
      Math.min(...positions.map(p => p[0])) - CUBE_SIZE / 2,
      Math.min(...positions.map(p => p[1])) - CUBE_SIZE / 2,
      Math.min(...positions.map(p => p[2])) - CUBE_SIZE / 2,
    ] as [number, number, number],
    max: [
      Math.max(...positions.map(p => p[0])) + CUBE_SIZE / 2,
      Math.max(...positions.map(p => p[1])) + CUBE_SIZE / 2,
      Math.max(...positions.map(p => p[2])) + CUBE_SIZE / 2,
    ] as [number, number, number],
  };

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    grid: {
      cubeSize: CUBE_SIZE,
      cubeGap: CUBE_GAP,
      gridStride: GRID_STRIDE,
      units: 'mm',
    },
    cubeCount: cubes.length,
    cubes,
    bounds,
  };
}

// ─── Convenience wrappers ────────────────────────────────────────────────

/**
 * Trigger a browser file download of the assembly JSON.
 * Reads directly from stores — call from React event handlers.
 */
export async function downloadAssemblyJSON(): Promise<void> {
  // Dynamic imports to avoid circular deps at module level
  const { useBuilderStore } = await import('../../store/useBuilderStore');
  const { useMemeStore } = await import('../../store/useMemeStore');

  const placedCubes = useBuilderStore.getState().placedCubes;
  const cubeOperators = useMemeStore.getState().cubeOperators;

  const data = buildAssemblyExport(placedCubes, cubeOperators);
  const json = JSON.stringify(data, null, 2);

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cuboid-assembly-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
