import { Rotation, Face } from './connectionRules';

export interface PlacedCube {
  id: string;
  variationId: string;
  position: [number, number, number];
  rotation: Rotation;
}

export interface FaceHoverInfo {
  adjacentPosition: [number, number, number];
  existingCubeFace: Face;
  existingVariationId: string;
  existingRotation: Rotation;
}
