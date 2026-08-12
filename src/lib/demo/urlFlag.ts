/**
 * Case-insensitive presence check for a URL query flag (`?demoExport`,
 * `?presenting`, …).
 *
 * Browsers don't actually lowercase query strings, but address-bar
 * autocomplete does something just as damaging in practice: once you've
 * visited `?demoExport` once, retyping it can get silently swapped for a
 * previously-visited variant from history (which may not match case) before
 * you hit Enter. On stage, with one shot at getting a flag right, "close
 * enough" needs to actually work — so every flag here matches regardless of
 * how it was capitalised.
 */
export function hasUrlFlag(name: string): boolean {
  if (typeof window === 'undefined') return false;
  const target = name.toLowerCase();
  for (const key of new URLSearchParams(window.location.search).keys()) {
    if (key.toLowerCase() === target) return true;
  }
  return false;
}
