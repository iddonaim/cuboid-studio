/**
 * Saved States — localStorage persistence
 * =========================================
 * Serialises / deserialises assembly state to localStorage.
 * Reuses the existing AssemblyExport format so saves are also
 * valid for JSON download / Grasshopper import.
 *
 * Storage key:  "cuboid-saved-states"  → JSON array of SavedState
 * Max slots:    20 (oldest auto-pruned)
 */

import { buildAssemblyExport, AssemblyExport } from './export/assemblyExport';
import { PlacedCube } from './cube/types';
import { OperatorRecord } from './operators/types';
import type { DecodeData } from './projects/types';

const STORAGE_KEY = 'cuboid-saved-states';
const MAX_STATES = 20;

export interface SavedState {
  id: string;
  name: string;
  savedAt: string;
  cubeCount: number;
  data: AssemblyExport;
  /**
   * Decode canvas snapshot. Kept OUTSIDE `data` so AssemblyExport stays a
   * clean JSON/Grasshopper download format. Optional: pre-existing saves
   * (and assembly-only saves) simply have no decode layer to restore.
   */
  decode?: DecodeData;
}

export function listSavedStates(): SavedState[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedState[];
  } catch {
    return [];
  }
}

export function saveState(
  name: string,
  placedCubes: PlacedCube[],
  cubeOperators: Record<string, OperatorRecord[]>,
  decode?: DecodeData,
): SavedState {
  const states = listSavedStates();
  const data = buildAssemblyExport(placedCubes, cubeOperators);

  const newState: SavedState = {
    id: `save-${Date.now()}`,
    name: name.trim() || `Assembly ${states.length + 1}`,
    savedAt: new Date().toISOString(),
    cubeCount: placedCubes.length,
    data,
    ...(decode && decode.canvasTiles.length > 0 ? { decode } : {}),
  };

  const updated = [newState, ...states].slice(0, MAX_STATES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return newState;
}

export function deleteSavedState(id: string): void {
  const states = listSavedStates().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
}

/** Converts a saved state back to PlacedCube[] for loading into the builder. */
export function savedStateToPlacedCubes(savedState: SavedState): PlacedCube[] {
  return savedState.data.cubes.map(cube => ({
    id: cube.id,
    variationId: cube.variationId,
    position: cube.position,
    rotation: {
      x: (cube.rotation.x as 0 | 1 | 2 | 3),
      y: (cube.rotation.y as 0 | 1 | 2 | 3),
    },
  }));
}

/**
 * Rehydrates the save's per-cube operator history (the meme-driven cuts),
 * keyed by cube id. A save carries these inside its AssemblyExport; loading
 * only the cubes would silently drop every cut the assembly had.
 */
export function savedStateToOperators(
  savedState: SavedState,
): Record<string, OperatorRecord[]> {
  const cubeOperators: Record<string, OperatorRecord[]> = {};
  for (const cube of savedState.data.cubes) {
    if (!cube.operators || cube.operators.length === 0) continue;
    cubeOperators[cube.id] = cube.operators.map(op => ({
      id: op.id,
      source: 'meme' as const,
      operator: op.operator as OperatorRecord['operator'],
      targets: op.targets as OperatorRecord['targets'],
      magnitude: op.magnitude,
      decay: op.decay,
      createdAt: op.createdAt,
      memeDescription: op.memeDescription,
      reasoning: op.reasoning,
      cutter: op.cutter as OperatorRecord['cutter'],
    }));
  }
  return cubeOperators;
}
