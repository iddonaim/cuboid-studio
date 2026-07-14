/**
 * Model lab feature flag.
 *
 * The Model lab — the cross-model comparison panels in Encode and Pataphysical
 * (registry: src/lib/models.ts) — is archived. The system standardizes on a
 * single model (Sonnet 4.6), so the everyday UI no longer needs a model picker.
 * None of the code is deleted: the panels, store logic, and registry all stay
 * in the tree so the lab can be revived the next time a new model appears and
 * a cross-model comparison is worth running again.
 *
 * Two ways to bring it back:
 *   1. Flip MODEL_LAB_ENABLED to `true` below — a one-line change, the intended
 *      path for a future Claude Code session. That shows the lab for everyone.
 *   2. Live, without a redeploy: open the app with `?modellab=1` in the URL.
 *      The choice is remembered in localStorage, so it survives navigation and
 *      reloads until you turn it off again with `?modellab=0`.
 *
 * The decision protocol the lab supports lives in docs/MODEL_STRATEGY.md.
 */

/** Compile-time default. Set to `true` to show the Model lab for all visitors. */
export const MODEL_LAB_ENABLED = false;

const STORAGE_KEY = 'cuboid:modelLabEnabled';

/**
 * Read the `?modellab=` override from the current URL and persist it. Call once
 * at startup (see main.tsx), before React renders, so the panels see the right
 * value on their first render.
 *
 * `?modellab=1` (or `true`) turns the lab on and remembers it; `?modellab=0`
 * (or `false`) turns it off and forgets it. Any other or absent value leaves
 * the stored preference untouched.
 */
export function syncModelLabFlagFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = new URLSearchParams(window.location.search).get('modellab');
    if (raw === null) return;
    if (raw === '1' || raw === 'true') {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } else if (raw === '0' || raw === 'false') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage can throw in private-mode / sandboxed contexts; the lab
    // simply stays at its compile-time default there.
  }
}

/**
 * Whether the Model lab should render. True when the compile-time flag is on,
 * or the browser has the `?modellab=1` override remembered.
 */
export function isModelLabEnabled(): boolean {
  if (MODEL_LAB_ENABLED) return true;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
