import { describe, it, expect, afterEach } from 'vitest';
import {
  captureSheetThumbnail,
  registerSheetCapture,
  unregisterSheetCapture,
} from './decodeSheetExport';
import type { CanvasTile, DecodeUnderlay } from '../../store/useDecodeStore';

const tile = (x: number, y: number): CanvasTile => ({
  id: `t-${x}-${y}`,
  variationId: 'v-01',
  x,
  y,
  rotation: 0,
});

const underlay = (over: Partial<DecodeUnderlay> = {}): DecodeUnderlay => ({
  id: 'u1',
  source: 'plan',
  label: 'Plan',
  visible: true,
  opacity: 1,
  dataUrl: 'data:image/png;base64,AAAA',
  thumbnailDataUrl: 'data:image/jpeg;base64,BBBB',
  imageHash: 'hash',
  width: 100,
  height: 50,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  scale: 1,
  ...over,
});

/** Stand in for the mounted Konva stage, recording what it was asked for. */
function stubStage(image: (ratio: number) => string) {
  const ratios: number[] = [];
  registerSheetCapture(options => {
    const ratio = options?.pixelRatio ?? 1;
    ratios.push(ratio);
    return image(ratio);
  });
  return ratios;
}

afterEach(() => unregisterSheetCapture());

describe('captureSheetThumbnail', () => {
  it('asks the stage for an image scaled to a ~240px longest edge', () => {
    // 400 wide before padding, so the request has to scale down, not up.
    const tiles = [tile(0, 0), tile(400, 0)];
    const ratios = stubStage(() => 'data:image/png;base64,SMALL');

    expect(captureSheetThumbnail(tiles)).toBe('data:image/png;base64,SMALL');
    expect(ratios).toHaveLength(1);
    // ratio × longest edge lands on the target, whatever the drawing's size.
    expect(ratios[0]).toBeGreaterThan(0);
    expect(ratios[0]).toBeLessThan(1);
  });

  it('sizes against the underlays too, not just the tiles', () => {
    const big = underlay({ width: 4000, height: 4000 });
    const ratios = stubStage(() => 'data:image/png;base64,SMALL');

    captureSheetThumbnail([tile(0, 0)], [big]);
    // A 4000-unit plan must be scaled far harder than a lone 1-tile sheet.
    const soloRatios = stubStage(() => 'data:image/png;base64,SMALL');
    captureSheetThumbnail([tile(0, 0)]);
    expect(ratios[0]).toBeLessThan(soloRatios[0]);
  });

  it('is null when nothing is drawn — an empty sheet has no thumbnail', () => {
    stubStage(() => 'data:image/png;base64,SMALL');
    expect(captureSheetThumbnail([], [])).toBeNull();
  });

  it('is null when the sheet is not mounted', () => {
    // No stage registered: saving from another mode reaches nothing live.
    expect(captureSheetThumbnail([tile(0, 0)])).toBeNull();
  });

  it('steps down to a smaller edge rather than giving up when oversize', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(200_000);
    let attempt = 0;
    // Only the first, largest attempt blows the budget.
    const ratios = stubStage(() => (++attempt === 1 ? huge : 'data:image/png;base64,OK'));

    expect(captureSheetThumbnail([tile(0, 0)])).toBe('data:image/png;base64,OK');
    expect(ratios).toHaveLength(2);
    // The retry really is smaller, not the same request twice.
    expect(ratios[1]).toBeLessThan(ratios[0]);
  });

  it('gives up rather than filing an image too big for the document', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(200_000);
    stubStage(() => huge);
    // Better a composition with no thumbnail than a write that fails.
    expect(captureSheetThumbnail([tile(0, 0)])).toBeNull();
  });
});
