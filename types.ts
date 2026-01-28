
export enum ConnectorType {
  Sphere = 'sphere',
  Cylinder = 'cylinder',
  Shell = 'shell',
  Flat = 'flat'
}

export type FaceKey = 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';

export interface BooleanCut {
  id: number; // 0-7
  type: 'sphere' | 'cylinder';
  position: [number, number, number];
  rotation?: [number, number, number];
}

export interface CubeVariation {
  id: string;
  name: string;
  faces: Record<FaceKey, ConnectorType>;
  cuts: BooleanCut[]; // The 4 active objects out of 8
  shellFace: FaceKey;
  complexity: number;
}

export interface PlacedCube {
  id: string;
  variationId: string;
  position: [number, number, number];
  rotation: [number, number, number];
}

// New types for actual Rhino mesh geometry
export interface RhinoMeshData {
  id: string;
  vertices: number[][];
  faces: number[][];
}

export interface MeshVariation {
  id: string;
  name: string;
  meshData: RhinoMeshData;
  complexity: number;
}
