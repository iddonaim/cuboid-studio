// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CubeChangeCard } from './CubeChangeCard';
import { RecordViewerDrawer } from '../meme/TranslationRecord';
import { useMemeStore } from '../../store/useMemeStore';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useRecordViewerStore } from '../../store/useRecordViewerStore';
import type { OperatorRecord } from '../../lib/operators/types';

// jsdom has no ResizeObserver; the card's context-transparency slider (Radix)
// needs one to mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub;

const CUBE_ID = 'cube-under-test';

function makeRecord(overrides: Partial<OperatorRecord> = {}): OperatorRecord {
  return {
    id: 'op-1',
    source: 'meme',
    operator: 'erosion',
    targets: ['adjacency'],
    magnitude: 0.6,
    decay: 0.3,
    createdAt: '2026-07-01T12:00:00.000Z',
    memeDescription: 'A meme about waiting for a bus that never comes',
    reasoning: 'Erode the corner to express indefinite waiting',
    cutter: { type: 'sphere', proportions: [0.5, 0.5, 0.5], position: [0, 0, 0], rotation: [0, 0, 0] },
    origin: 'evolution',
    memeTitle: 'Bus stop meme',
    memeImageUrl: 'https://example.com/meme.jpg',
    ...overrides,
  };
}

function seedStores(records: OperatorRecord[], targetCubeId: string | null = CUBE_ID) {
  useBuilderStore.setState({
    placedCubes: [{ id: CUBE_ID, variationId: 'v-07', position: [0, 21, 0], rotation: { x: 0, y: 0 } }],
  });
  useMemeStore.setState({
    targetCubeId,
    cubeOperators: records.length > 0 ? { [CUBE_ID]: records } : {},
  });
}

function renderCard() {
  // The drawer is mounted app-wide in production; render it alongside the
  // card so "row click → full reading" is exercised end to end.
  return render(
    <>
      <CubeChangeCard docked />
      <RecordViewerDrawer />
    </>,
  );
}

beforeEach(() => {
  seedStores([]);
});

afterEach(() => {
  cleanup();
  useMemeStore.setState({ targetCubeId: null, cubeOperators: {} });
  useBuilderStore.setState({ placedCubes: [] });
  useRecordViewerStore.setState({ record: null });
});

describe('CubeChangeCard', () => {
  it('renders nothing when no cube is selected', () => {
    seedStores([makeRecord()], null);
    const { container } = render(<CubeChangeCard docked />);
    expect(container.firstChild).toBeNull();
  });

  it('tells the user when the selected cube has not been changed', () => {
    seedStores([]);
    renderCard();
    expect(screen.getByText(/hasn't been changed yet/)).toBeTruthy();
    expect(screen.getByText(/v-07 · unchanged/)).toBeTruthy();
  });

  it('lists a change row with its operator and origin', () => {
    seedStores([makeRecord()]);
    renderCard();

    expect(screen.getByText(/v-07 · 1 change/)).toBeTruthy();
    expect(screen.getByText('erosion')).toBeTruthy();
    expect(screen.getByText('Evolve')).toBeTruthy();
    // Full prose stays out of the card — it lives in the drawer.
    expect(screen.queryByText('Erode the corner to express indefinite waiting')).toBeNull();
  });

  it('opens the full-reading drawer when a row is clicked', () => {
    seedStores([makeRecord()]);
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /#1/ }));

    expect(screen.getByText('Bus stop meme')).toBeTruthy();
    expect(screen.getByText('Erode the corner to express indefinite waiting')).toBeTruthy();
    expect(screen.getByText('sphere')).toBeTruthy();

    // Escape closes the drawer again.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Erode the corner to express indefinite waiting')).toBeNull();
  });

  it('lists multiple changes newest-first and labels their origin', () => {
    seedStores([
      makeRecord({ id: 'op-1', operator: 'drift', origin: 'pataphysical', reasoning: 'first change' }),
      makeRecord({ id: 'op-2', operator: 'erosion', origin: 'evolution', reasoning: 'second change' }),
    ]);
    renderCard();

    expect(screen.getByText(/v-07 · 2 changes/)).toBeTruthy();
    expect(screen.getByText('Evolve')).toBeTruthy();
    expect(screen.getByText('Pataphysical')).toBeTruthy();

    const rows = screen.getAllByRole('button', { name: /#\d/ });
    // Newest (#2) renders first.
    expect(rows[0].textContent).toContain('#2');
    expect(rows[0].textContent).toContain('erosion');
    expect(rows[1].textContent).toContain('#1');
    expect(rows[1].textContent).toContain('drift');

    // Opening the older entry shows its reasoning in the drawer.
    fireEvent.click(rows[1]);
    expect(screen.getByText('first change')).toBeTruthy();
    expect(screen.queryByText('second change')).toBeNull();
  });
});
