
import { ConnectorType, CubeVariation, FaceKey, BooleanCut } from './types';

export const CUBE_SIZE = 42;
export const CUBE_GAP = 0.6;
export const GRID_STRIDE = CUBE_SIZE + CUBE_GAP;

// Define the "Master 8" potential cutting objects (4 spheres, 4 cylinders)
export const MASTER_CUTTERS: BooleanCut[] = [
  { id: 0, type: 'sphere', position: [21, 21, 21] },     // Corner Top-Right-Front
  { id: 1, type: 'sphere', position: [-21, 21, 21] },    // Corner Top-Left-Front
  { id: 2, type: 'sphere', position: [21, -21, -21] },   // Corner Bottom-Right-Back
  { id: 3, type: 'sphere', position: [-21, -21, -21] },  // Corner Bottom-Left-Back
  { id: 4, type: 'cylinder', position: [0, 0, 0], rotation: [Math.PI/2, 0, 0] }, // X-Axis
  { id: 5, type: 'cylinder', position: [0, 0, 0], rotation: [0, 0, 0] },         // Y-Axis
  { id: 6, type: 'cylinder', position: [21, 0, 21], rotation: [0, 0, 0] },       // Vertical Edge
  { id: 7, type: 'cylinder', position: [0, 21, -21], rotation: [0, Math.PI/2, 0] }, // Horizontal Back
];

export const generateVariations = (): CubeVariation[] => {
  const variations: CubeVariation[] = [];
  
  for (let i = 0; i < 70; i++) {
    // Deterministically pick 4 out of 8 cutters for this variation
    const activeIndices: number[] = [];
    let seed = i;
    while (activeIndices.length < 4) {
      const idx = seed % 8;
      if (!activeIndices.includes(idx)) activeIndices.push(idx);
      seed = Math.floor(seed / 1.5) + 7;
    }

    const cuts = activeIndices.map(idx => MASTER_CUTTERS[idx]);
    
    // Map cuts to faces based on proximity (Simplified logic for the app)
    const faces: Record<FaceKey, ConnectorType> = {
      top: ConnectorType.Flat,
      bottom: ConnectorType.Flat,
      left: ConnectorType.Flat,
      right: ConnectorType.Flat,
      front: ConnectorType.Flat,
      back: ConnectorType.Flat,
    };

    cuts.forEach(cut => {
      // Logic: if cutter is at a face boundary, mark that face
      if (cut.type === 'sphere') {
        if (cut.position[1] > 20) faces.top = ConnectorType.Sphere;
        if (cut.position[1] < -20) faces.bottom = ConnectorType.Sphere;
        if (cut.position[2] > 20) faces.front = ConnectorType.Sphere;
      } else {
        if (cut.rotation && cut.rotation[0] !== 0) faces.front = ConnectorType.Cylinder;
        else faces.top = ConnectorType.Cylinder;
      }
    });

    const shellFace: FaceKey = 'top'; // Per rule: shell action on face with largest area
    faces[shellFace] = ConnectorType.Shell;

    variations.push({
      id: `v-${i + 1}`,
      name: `Boolean Set ${i + 1}`,
      faces,
      cuts,
      shellFace,
      complexity: activeIndices.reduce((a, b) => a + b, 0) % 5 + 1
    });
  }
  return variations;
};

export const CUBE_VARIATIONS = generateVariations();

export const COLORS = {
  [ConnectorType.Sphere]: '#818cf8',
  [ConnectorType.Cylinder]: '#34d399',
  [ConnectorType.Shell]: '#fbbf24',
  [ConnectorType.Flat]: '#475569',
};

export const OPPOSITE_FACES: Record<FaceKey, FaceKey> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
  front: 'back',
  back: 'front',
};
