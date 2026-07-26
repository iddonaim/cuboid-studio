/**
 * Accent theme — the user-chosen accent color.
 *
 * The whole app is themed off a single CSS variable, `--primary` (see
 * index.css). Overriding that one variable at runtime recolors every semantic
 * surface (buttons, active tabs, links, focus rings, `bg-primary`/`text-primary`
 * utilities) instantly. This module owns that override plus a small subscribable
 * store, so imperative, non-React code (Three.js materials, Leaflet layers,
 * Konva shapes) can read the live accent too.
 *
 * EXPORTS AND BRAND ILLUSTRATIONS DO NOT USE THE ACCENT. Exported drawings
 * (DXF/SVG) and the onboarding diagram stay on CANONICAL_ACCENT so an artifact
 * a user shares is always the same drafting vermilion, regardless of their UI
 * preference.
 */

/** The fixed drafting vermilion. Default UI accent, and the permanent color of
 *  exports + brand illustrations. Matches `--primary: 14 72% 43%` in index.css. */
export const CANONICAL_ACCENT = '#bd441f';

const STORAGE_KEY = 'cuboid.accent';

// ── Live store (for non-React consumers) ───────────────────────────────────
let current = CANONICAL_ACCENT;
const listeners = new Set<(hex: string) => void>();

/** The accent in effect right now, as a hex string. Safe to call anywhere. */
export function getAccent(): string {
  return current;
}

/** Subscribe to accent changes (for imperative code). Returns an unsubscribe. */
export function subscribeAccent(cb: (hex: string) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ── Color math ─────────────────────────────────────────────────────────────
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Convert a hex color to the `"H S% L%"` triad the CSS variables expect. */
export function hexToHslTriad(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn: h = ((gn - bn) / d) % 6; break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** WCAG relative luminance (0 = black, 1 = white). */
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/**
 * A legible foreground (as an HSL triad) for text/icons sitting ON the accent.
 * This is what keeps a pale accent from making button labels unreadable: light
 * accents get near-black ink, dark accents get white.
 */
export function readableForegroundTriad(hex: string): string {
  return luminance(hex) > 0.5 ? '45 9% 13%' /* ink */ : '0 0% 100%' /* white */;
}

/** The drafting ink the cut surface used to be painted with, flat. */
const INK = '#33312a';

/** Max luminance a cut surface may have and still read as solid poché against
 *  the white cube fill. Vermilion (0.14) and every preset sit well below it. */
const CUT_MAX_LUMINANCE = 0.3;

/**
 * The color of a section-cut surface (the poché face revealed where a clipping
 * plane slices a cube) for a given accent.
 *
 * Section cuts are drafting poché: they must read as a solid, weighty fill
 * against the white cube. A dark accent does that on its own, so it is used
 * as-is. A pale accent (the picker allows any RGB) would wash out into the
 * white fill and make the cut vanish, so it is stepped toward the drafting ink
 * until it is dark enough to hold — keeping the hue the user chose while
 * preserving the cut's weight.
 */
export function sectionCutColor(hex: string): string {
  if (luminance(hex) <= CUT_MAX_LUMINANCE) return hex;

  const from = hexToRgb(hex);
  const ink = hexToRgb(INK);
  // Blend in 10% steps so the result stays close to the chosen hue.
  for (let step = 1; step <= 10; step++) {
    const t = step / 10;
    const mixed = rgbToHex({
      r: from.r + (ink.r - from.r) * t,
      g: from.g + (ink.g - from.g) * t,
      b: from.b + (ink.b - from.b) * t,
    });
    if (luminance(mixed) <= CUT_MAX_LUMINANCE) return mixed;
  }
  return INK;
}

// ── Apply / persist ─────────────────────────────────────────────────────────
/** Write the accent to the document's CSS variables and notify subscribers. */
export function applyAccent(hex: string): void {
  const triad = hexToHslTriad(hex);
  const root = document.documentElement;
  root.style.setProperty('--primary', triad);
  root.style.setProperty('--ring', triad);
  root.style.setProperty('--primary-foreground', readableForegroundTriad(hex));
  current = hex;
  listeners.forEach((l) => l(hex));
}

/** Read the persisted accent (device-local), falling back to canonical. */
export function loadStoredAccent(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || CANONICAL_ACCENT;
  } catch {
    return CANONICAL_ACCENT;
  }
}

export function storeAccent(hex: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, hex);
  } catch {
    /* private mode / storage disabled — accent just won't persist */
  }
}

/** A small curated set for one-tap choices, alongside the full-RGB picker. */
export const ACCENT_PRESETS: readonly { hex: string; name: string }[] = [
  { hex: CANONICAL_ACCENT, name: 'Vermilion' },
  { hex: '#1f6f5c', name: 'Pine' },
  { hex: '#2e6fb2', name: 'Azure' },
  { hex: '#6b4fa0', name: 'Iris' },
  { hex: '#b0842a', name: 'Ochre' },
  { hex: '#9c2f52', name: 'Garnet' },
  { hex: '#3a3a3a', name: 'Graphite' },
];
