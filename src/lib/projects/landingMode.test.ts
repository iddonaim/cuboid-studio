import { describe, it, expect } from 'vitest';
import { landingModeFor } from './composition';
import type { CompositionData, StoredUnderlay } from './types';
import type { CanvasTile } from '../../store/useDecodeStore';

const tile: CanvasTile = { id: 't1', variationId: 'v-01', x: 0, y: 0, rotation: 0 };

const storedUnderlay: StoredUnderlay = {
  thumbnailDataUrl: 'data:image/png;base64,AAAA',
  imageHash: 'hash',
  width: 100,
  height: 50,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  scale: 1,
};

function snapshot(over: {
  tiles?: CanvasTile[];
  underlays?: StoredUnderlay[];
  cubes?: number;
  savedFromMode?: CompositionData['savedFromMode'];
}): CompositionData {
  return {
    builderAssembly: {
      placedCubes: Array.from({ length: over.cubes ?? 0 }, (_, i) => ({ id: `c${i}` })),
      selectedIdx: 0,
      rulesEnabled: true,
      strictRulesEnabled: false,
    } as unknown as CompositionData['builderAssembly'],
    encode: null,
    pataphysical: {} as unknown as CompositionData['pataphysical'],
    evolution: {} as unknown as CompositionData['evolution'],
    decode: {
      canvasTiles: over.tiles ?? [],
      freestyle: false,
      ...(over.underlays ? { underlays: over.underlays } : {}),
    },
    siteContextSnapshot: null,
    ...(over.savedFromMode ? { savedFromMode: over.savedFromMode } : {}),
  };
}

describe('landingModeFor', () => {
  it('reopens on the sheet when that is where the work was', () => {
    // The gap this closes: an assembly plus a drawing used to always land in
    // Encode, so loading your own sheet meant clicking back into Decode.
    expect(
      landingModeFor(snapshot({ tiles: [tile], cubes: 4, savedFromMode: 'decode' })),
    ).toBe('decode');
  });

  it('reopens in Encode when the work was there, drawing or not', () => {
    expect(
      landingModeFor(snapshot({ tiles: [tile], cubes: 4, savedFromMode: 'encoding' })),
    ).toBe('encoding');
  });

  it('counts a registered layer as a sheet worth returning to', () => {
    expect(
      landingModeFor(snapshot({ underlays: [storedUnderlay], savedFromMode: 'decode' })),
    ).toBe('decode');
  });

  it('never lands on an empty sheet, whatever the saved mode says', () => {
    expect(landingModeFor(snapshot({ savedFromMode: 'decode' }))).toBe('encoding');
    expect(landingModeFor(snapshot({ cubes: 4, savedFromMode: 'decode' }))).toBe('encoding');
  });

  it('sends map and evolution saves to Encode, the general workspace', () => {
    expect(
      landingModeFor(snapshot({ tiles: [tile], cubes: 4, savedFromMode: 'evolution' })),
    ).toBe('encoding');
  });

  describe('compositions saved before the mode was recorded', () => {
    it('still lands in Decode when the sheet is the only content', () => {
      expect(landingModeFor(snapshot({ tiles: [tile] }))).toBe('decode');
    });

    it('still lands in Encode when there is an assembly behind it', () => {
      expect(landingModeFor(snapshot({ tiles: [tile], cubes: 4 }))).toBe('encoding');
    });
  });
});
