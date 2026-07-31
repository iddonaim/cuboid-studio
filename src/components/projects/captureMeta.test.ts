// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { captureMeta } from './CaptureGallery';
import type { CaptureRecord } from '../../lib/projects/types';

function capture(over: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    id: 'c1',
    storagePath: 'cuboidStudio/owner/captures/c1.png',
    thumbnailDataUrl: 'data:image/jpeg;base64,AAA',
    createdAt: 1_800_000_000_000,
    projection: 'orthographic',
    section: null,
    ...over,
  };
}

describe('captureMeta', () => {
  it('names the projection when nothing is sectioned', () => {
    expect(captureMeta(capture())).toBe('ortho · no section');
    expect(captureMeta(capture({ projection: 'perspective' }))).toBe('perspective · no section');
  });

  it('reports the section axis and position', () => {
    expect(captureMeta(capture({ section: { axis: 'x', position: 21, flipped: false } })))
      .toBe('ortho · section X 21');
  });

  it('rounds a fractional section position rather than showing noise', () => {
    expect(captureMeta(capture({ section: { axis: 'z', position: 20.6, flipped: false } })))
      .toBe('ortho · section Z 21');
  });

  it('marks a flipped cut — the same axis and position describe two drawings', () => {
    const plain = captureMeta(capture({ section: { axis: 'y', position: 10, flipped: false } }));
    const flipped = captureMeta(capture({ section: { axis: 'y', position: 10, flipped: true } }));
    expect(flipped).not.toBe(plain);
    expect(flipped).toContain('⇄');
  });
});
