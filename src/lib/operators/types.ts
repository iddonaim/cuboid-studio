export type OperatorClass = 'inversion' | 'amplification' | 'drift' | 'reassignment' | 'preservation' | 'shuffle';
export type CutterType = 'box' | 'sphere' | 'cylinder' | 'plane';
export type EdgeType = 'adjacency' | 'access' | 'visibility' | 'conflict' | 'overlap' | 'threshold';

export interface LLMCutterResult {
  type: CutterType;
  proportions: [number, number, number];
  position: [number, number, number];   // normalized -1 to 1
  rotation: [number, number, number];   // degrees
}

export interface LLMOperatorResult {
  operator: OperatorClass;
  targets: EdgeType[];
  magnitude: number;        // 0.0-1.0
  decay: number;            // 0.0-1.0
  cutter: LLMCutterResult;
  reasoning: string;
}

export interface OperatorRecord {
  id: string;
  source: 'meme';
  operator: OperatorClass;
  targets: EdgeType[];
  magnitude: number;
  decay: number;
  createdAt: string;
  memeDescription: string;
  reasoning: string;
  cutter: LLMCutterResult;
}
