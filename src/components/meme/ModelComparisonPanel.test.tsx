// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { ModelComparisonPanel } from './ModelComparisonPanel';
import { MODEL_OPTIONS } from '../../lib/models';
import { useMemeStore } from '../../store/useMemeStore';

describe('ModelComparisonPanel', () => {
  afterEach(cleanup);

  beforeEach(() => {
    // The panel lives in a collapsible Section that is closed by default;
    // pre-open it via the same localStorage key the Section reads.
    localStorage.setItem('cs-section:pata-model-lab', '1');
    useMemeStore.setState({
      memeDescription: '',
      comparisonEntries: [],
      isComparing: false,
      isTranslating: false,
    });
  });

  it('lists every registry model as a checkbox', () => {
    render(<ModelComparisonPanel />);
    for (const m of MODEL_OPTIONS) {
      expect(screen.getByText(m.label)).toBeTruthy();
    }
    expect(screen.getAllByRole('checkbox')).toHaveLength(MODEL_OPTIONS.length);
  });

  it('disables the run button without a meme description', () => {
    render(<ModelComparisonPanel />);
    const button = screen.getByRole('button', { name: /run comparison/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables the run button once a meme description exists', () => {
    useMemeStore.setState({ memeDescription: 'a meme about gentrification' });
    render(<ModelComparisonPanel />);
    const button = screen.getByRole('button', { name: /run comparison/i });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders per-model errors without hiding successful entries', () => {
    useMemeStore.setState({
      memeDescription: 'a meme',
      comparisonEntries: [
        { modelId: 'anthropic/claude-sonnet-4', label: 'Sonnet 4', status: 'error', error: 'API error (404): no such model', elapsedMs: 900 },
        {
          modelId: 'anthropic/claude-sonnet-4.6',
          label: 'Sonnet 4.6',
          status: 'done',
          elapsedMs: 8200,
          resolvedModel: 'anthropic/claude-sonnet-4.6',
          confidenceVector: {
            rhetorical_clarity: 0.9,
            site_resonance: 0.4,
            affective_coherence: 0.8,
            operational_specificity: 0.6,
          },
          result: {
            operator: 'erosion',
            targets: ['adjacency'],
            magnitude: 0.7,
            decay: 0.2,
            cutter: { type: 'sphere', proportions: [0.4, 0.4, 0.4], position: [0, 0, 0], rotation: [0, 0, 0] },
            reasoning: 'The meme mourns a disappearing texture.',
          },
        },
      ],
    });
    render(<ModelComparisonPanel />);
    expect(screen.getByText(/no such model/i)).toBeTruthy();
    expect(screen.getByText('erosion')).toBeTruthy();
    expect(screen.getByRole('button', { name: /apply this reading/i })).toBeTruthy();
  });
});
