import { describe, it, expect } from 'vitest';
import {
  ACCENT_PRESETS,
  CANONICAL_ACCENT,
  hexToHslTriad,
  readableForegroundTriad,
  sectionCutColor,
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

describe('section cut color', () => {
  it('paints the cut in the accent itself when the accent is dark enough', () => {
    expect(sectionCutColor(CANONICAL_ACCENT)).toBe(CANONICAL_ACCENT);
  });

  it('leaves every curated preset untouched', () => {
    for (const preset of ACCENT_PRESETS) {
      expect(sectionCutColor(preset.hex)).toBe(preset.hex);
    }
  });

  it('darkens a pale accent so the cut still reads as solid poché', () => {
    const pale = '#ffe066';
    const cut = sectionCutColor(pale);
    expect(cut).not.toBe(pale);
    // Still recognizably the chosen hue, just weightier.
    expect(hexToHslTriad(cut).split(' ')[0]).toBe(hexToHslTriad(pale).split(' ')[0]);
  });

  it('never returns something as light as the white cube fill', () => {
    for (const hex of ['#ffffff', '#ffe066', '#8ad6ff', '#cccccc']) {
      // A cut this pale would vanish into the fill; the helper must prevent it.
      expect(sectionCutColor(hex)).not.toBe(hex);
    }
  });
});
