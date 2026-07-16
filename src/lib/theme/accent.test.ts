import { describe, it, expect } from 'vitest';
import {
  CANONICAL_ACCENT,
  hexToHslTriad,
  readableForegroundTriad,
} from './accent';

describe('accent color math', () => {
  it('maps the canonical vermilion to the index.css --primary triad', () => {
    // index.css defines --primary: 14 72% 43%. The picker must reproduce it
    // exactly so the default accent is a no-op.
    expect(hexToHslTriad(CANONICAL_ACCENT)).toBe('14 72% 43%');
  });

  it('handles shorthand hex and pure colors', () => {
    expect(hexToHslTriad('#fff')).toBe('0 0% 100%');
    expect(hexToHslTriad('#000')).toBe('0 0% 0%');
  });

  it('picks a legible foreground: white on dark accents, ink on light ones', () => {
    expect(readableForegroundTriad(CANONICAL_ACCENT)).toBe('0 0% 100%'); // white
    expect(readableForegroundTriad('#2e6fb2')).toBe('0 0% 100%'); // azure → white
    expect(readableForegroundTriad('#ffe066')).toBe('45 9% 13%'); // pale yellow → ink
  });
});
