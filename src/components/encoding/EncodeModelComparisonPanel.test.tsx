// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { EncodeModelComparisonPanel } from './EncodeModelComparisonPanel';
import { MODEL_OPTIONS } from '../../lib/models';
import { useEncodingStore } from '../../store/useEncodingStore';
import type { SpatialReading } from '../../lib/api/encodeSpace';

const READING: SpatialReading = {
  atmosphere: { phrase: 'porous, softly worn', position: 0.4 },
  light: { phrase: 'even and diffuse', position: 0.3 },
  emotion: { phrase: 'quietly hopeful', position: 0.6 },
  rhythm: { phrase: 'a loose repeating beat', option: 'regular' },
  placement: { phrase: 'set back from the street', option: 'recessed' },
};

describe('EncodeModelComparisonPanel', () => {
  afterEach(cleanup);

  beforeEach(() => {
    // The panel lives in a collapsible Section that is closed by default;
    // pre-open it via the same localStorage key the Section reads.
    localStorage.setItem('cs-section:encode-model-lab', '1');
    useEncodingStore.setState({
      multiPhotoEnabled: false,
      uploadedImage: null,
      uploadedImages: [],
      imageBase64: null,
      imagesRestoredOnly: false,
      isEncoding: false,
      isComparingEncode: false,
      encodeComparisonEntries: [],
    });
  });

  it('lists every registry model as a checkbox', () => {
    render(<EncodeModelComparisonPanel />);
    for (const m of MODEL_OPTIONS) {
      expect(screen.getByText(m.label)).toBeTruthy();
    }
    expect(screen.getAllByRole('checkbox')).toHaveLength(MODEL_OPTIONS.length);
  });

  it('disables the run button without an uploaded image', () => {
    render(<EncodeModelComparisonPanel />);
    const button = screen.getByRole('button', { name: /run comparison/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables the run button once an image exists', () => {
    useEncodingStore.setState({ uploadedImage: 'data:image/jpeg;base64,abc' });
    render(<EncodeModelComparisonPanel />);
    const button = screen.getByRole('button', { name: /run comparison/i });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders per-model errors without hiding successful entries', () => {
    useEncodingStore.setState({
      uploadedImage: 'data:image/jpeg;base64,abc',
      encodeComparisonEntries: [
        {
          modelId: 'openai/gpt-5.6-sol',
          label: 'GPT-5.6 Sol',
          status: 'error',
          error: 'OpenRouter API error (404): no such model',
          elapsedMs: 900,
        },
        {
          modelId: 'anthropic/claude-sonnet-4.6',
          label: 'Sonnet 4.6',
          status: 'done',
          elapsedMs: 7200,
          resolvedModel: 'anthropic/claude-sonnet-4.6',
          reading: READING,
          reasoning: 'A worn but hopeful corner.',
          cubes: [{ variationId: 'v-05', position: [0, 21, 0], rotation: { x: 0, y: 0 } }],
          lexicon: null,
          lexiconId: null,
        },
      ],
    });
    render(<EncodeModelComparisonPanel />);
    expect(screen.getByText(/no such model/i)).toBeTruthy();
    expect(screen.getByText(/quietly hopeful/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /show this composition/i })).toBeTruthy();
  });
});
