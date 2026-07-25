import { describe, it, expect } from 'vitest';
import { embedPngText } from './pngMetadata';

/** Build a minimal structurally-valid PNG: signature + IHDR(13 bytes) + IEND. */
function minimalPng(): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = new Uint8Array(4 + 4 + 13 + 4);
  new DataView(ihdr.buffer).setUint32(0, 13);
  ihdr.set([0x49, 0x48, 0x44, 0x52], 4); // "IHDR"
  // 1×1, bit depth 8, color type 6 — payload values are irrelevant here.
  new DataView(ihdr.buffer).setUint32(8, 1);
  new DataView(ihdr.buffer).setUint32(12, 1);
  ihdr.set([8, 6, 0, 0, 0], 16);
  const iend = new Uint8Array([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  const out = new Uint8Array(sig.length + ihdr.length + iend.length);
  out.set(sig, 0);
  out.set(ihdr, sig.length);
  out.set(iend, sig.length + ihdr.length);
  return out;
}

function ascii(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => String.fromCharCode(b)).join('');
}

describe('embedPngText', () => {
  it('inserts a tEXt chunk after IHDR with keyword and payload intact', () => {
    const png = minimalPng();
    const out = embedPngText(png, 'cuboid-provenance', '{"a":1}');

    expect(out.length).toBe(png.length + 4 + 4 + 'cuboid-provenance'.length + 1 + '{"a":1}'.length + 4);
    // Signature untouched
    expect(Array.from(out.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // Chunk sits right after IHDR (offset 33), typed tEXt
    expect(ascii(out.subarray(37, 41))).toBe('tEXt');
    expect(ascii(out)).toContain('cuboid-provenance\0{"a":1}');
    // Original chunks still present and in order
    expect(ascii(out)).toContain('IHDR');
    expect(ascii(out).indexOf('tEXt')).toBeLessThan(ascii(out).indexOf('IEND'));
  });

  it('returns non-PNG input unchanged (capture must never fail on metadata)', () => {
    const notPng = new Uint8Array(64).fill(7);
    expect(embedPngText(notPng, 'k', 'v')).toBe(notPng);
  });
});
