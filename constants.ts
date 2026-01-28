export const CUBE_SIZE = 42;
export const CUBE_GAP = 0.6;
export const GRID_STRIDE = CUBE_SIZE + CUBE_GAP;

// Colors used by legacy components
export const COLORS: Record<string, string> = {
  sphere: '#818cf8',
  cylinder: '#34d399',
  shell: '#fbbf24',
  flat: '#475569',
  base: '#334155',
  selected: '#6366f1',
  background: '#0f172a',
  border: '#1e293b',
  text: '#94a3b8',
  muted: '#64748b',
};

export interface BooleanCut {
  id: number;
  type: 'sphere' | 'cylinder';
  position: [number, number, number];
  rotation?: [number, number, number];
}

export interface CubeVariation {
  id: string;
  name: string;
  cuts: BooleanCut[];
}

// Define the "Master 8" potential cutting objects (4 spheres, 4 cylinders)
const MASTER_CUTTERS: BooleanCut[] = [
  { id: 0, type: 'sphere', position: [21, 21, 21] },
  { id: 1, type: 'sphere', position: [-21, 21, 21] },
  { id: 2, type: 'sphere', position: [21, -21, -21] },
  { id: 3, type: 'sphere', position: [-21, -21, -21] },
  { id: 4, type: 'cylinder', position: [0, 0, 0], rotation: [Math.PI/2, 0, 0] },
  { id: 5, type: 'cylinder', position: [0, 0, 0], rotation: [0, 0, 0] },
  { id: 6, type: 'cylinder', position: [21, 0, 21], rotation: [0, 0, 0] },
  { id: 7, type: 'cylinder', position: [0, 21, -21], rotation: [0, Math.PI/2, 0] },
];

// Generate all combinations of 4 cutters from 8 (C(8,4) = 70)
function generateVariations(): CubeVariation[] {
  const variations: CubeVariation[] = [];

  // Generate all combinations of 4 indices from [0,1,2,3,4,5,6,7]
  for (let a = 0; a < 8; a++) {
    for (let b = a + 1; b < 8; b++) {
      for (let c = b + 1; c < 8; c++) {
        for (let d = c + 1; d < 8; d++) {
          const indices = [a, b, c, d];
          const cuts = indices.map(idx => MASTER_CUTTERS[idx]);

          variations.push({
            id: `v-${variations.length + 1}`,
            name: `Boolean Set ${variations.length + 1}`,
            cuts
          });
        }
      }
    }
  }

  return variations;
}

export const CUBE_VARIATIONS = generateVariations();
