import { describe, it, expect, beforeEach } from 'vitest';
import { useEncodingStore } from './useEncodingStore';
import type { EncodedCube, SpatialReading } from '../lib/api/encodeSpace';
import { DEFAULT_LEXICON } from '../prompts/lexicon.default';
import { CUBE_SIZE, GRID_STRIDE } from '../lib/cube/constants';

const GROUND = CUBE_SIZE / 2;

function cube(id: string, variationId: string, cell: [number, number, number]): EncodedCube {
  return {
    id,
    variationId,
    position: [cell[0] * GRID_STRIDE, GROUND + cell[1] * GRID_STRIDE, cell[2] * GRID_STRIDE],
    rotation: { x: 0, y: 0 },
  };
}

function reading(phrase: string): SpatialReading {
  return {
    atmosphere: { position: 0.5, phrase },
    light: { position: 0.5, phrase },
    emotion: { position: 0.5, phrase },
    rhythm: { option: 'planar_arrangement', phrase },
    placement: { option: 'asymmetric_scattered', phrase },
  } as SpatialReading;
}

/** Put the store in the state a finished encode leaves behind. */
function seedCurrentResult() {
  useEncodingStore.setState({
    encodedCubes: [cube('a', 'v-01', [0, 0, 0]), cube('b', 'v-02', [1, 0, 0])],
    encodingReading: reading('the old reading'),
    encodingReadingOriginal: reading('the model original'),
    readingEdited: true,
    encodingReasoning: 'old reasoning',
    encodingLexicon: DEFAULT_LEXICON,
    encodingLexiconId: null,
    encodingModel: 'model-old',
    encodingPromptVersion: '1',
    remixResultReplacesSeed: false,
    resultApplied: true,
    previousResult: null,
    showPreviousProposal: false,
  });
}

describe('previous-result snapshot', () => {
  beforeEach(() => {
    useEncodingStore.setState({ previousResult: null, showPreviousProposal: false });
  });

  it('restore puts the replaced result back, un-applied', () => {
    seedCurrentResult();
    const replaced = useEncodingStore.getState();

    // Stand in for what encode() writes on success.
    useEncodingStore.setState({
      previousResult: {
        cubes: replaced.encodedCubes!,
        reading: replaced.encodingReading,
        readingOriginal: replaced.encodingReadingOriginal,
        readingEdited: replaced.readingEdited,
        reasoning: replaced.encodingReasoning,
        lexicon: replaced.encodingLexicon,
        lexiconId: replaced.encodingLexiconId,
        model: replaced.encodingModel,
        promptVersion: replaced.encodingPromptVersion,
        remixResultReplacesSeed: replaced.remixResultReplacesSeed,
        wasApplied: replaced.resultApplied,
        replacedAt: new Date().toISOString(),
      },
      encodedCubes: [cube('c', 'v-09', [0, 1, 0])],
      encodingReading: reading('the new reading'),
      encodingReadingOriginal: reading('the new reading'),
      readingEdited: false,
      encodingReasoning: 'new reasoning',
      encodingModel: 'model-new',
      resultApplied: false,
    });

    useEncodingStore.getState().restorePreviousResult();
    const s = useEncodingStore.getState();

    expect(s.encodedCubes?.map(c => c.id)).toEqual(['a', 'b']);
    expect(s.encodingReading?.atmosphere.phrase).toBe('the old reading');
    expect(s.encodingReasoning).toBe('old reasoning');
    expect(s.encodingModel).toBe('model-old');
    // The architect's revisions to the restored reading survive the round trip.
    expect(s.readingEdited).toBe(true);
    // Restoring never writes to the assembly, so it can't claim to be applied.
    expect(s.resultApplied).toBe(false);
    expect(s.previousResult).toBeNull();
    expect(s.showPreviousProposal).toBe(false);
  });

  it('restore is a no-op with nothing snapshotted', () => {
    seedCurrentResult();
    useEncodingStore.getState().restorePreviousResult();
    expect(useEncodingStore.getState().encodedCubes?.map(c => c.id)).toEqual(['a', 'b']);
    expect(useEncodingStore.getState().resultApplied).toBe(true);
  });

  it('discard drops the snapshot and the before/after ghost', () => {
    useEncodingStore.setState({
      previousResult: {
        cubes: [cube('a', 'v-01', [0, 0, 0])],
        reading: null,
        readingOriginal: null,
        readingEdited: false,
        reasoning: null,
        lexicon: null,
        lexiconId: null,
        model: null,
        promptVersion: null,
        remixResultReplacesSeed: false,
        wasApplied: false,
        replacedAt: new Date().toISOString(),
      },
      showPreviousProposal: true,
    });

    useEncodingStore.getState().discardPreviousResult();
    expect(useEncodingStore.getState().previousResult).toBeNull();
    expect(useEncodingStore.getState().showPreviousProposal).toBe(false);
  });

  it('clearing the image drops the snapshot with the result', () => {
    seedCurrentResult();
    useEncodingStore.setState({
      previousResult: {
        cubes: [cube('a', 'v-01', [0, 0, 0])],
        reading: null,
        readingOriginal: null,
        readingEdited: false,
        reasoning: null,
        lexicon: null,
        lexiconId: null,
        model: null,
        promptVersion: null,
        remixResultReplacesSeed: false,
        wasApplied: false,
        replacedAt: new Date().toISOString(),
      },
      showPreviousProposal: true,
    });

    useEncodingStore.getState().clearImage();
    const s = useEncodingStore.getState();
    expect(s.encodedCubes).toBeNull();
    expect(s.previousResult).toBeNull();
    expect(s.showPreviousProposal).toBe(false);
  });
});
