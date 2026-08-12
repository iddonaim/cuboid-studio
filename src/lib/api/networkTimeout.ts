/**
 * Shared timeout + fallback plumbing for the two live-AI calls a presenter
 * depends on mid-talk (Encode, Evolution/Pataphysical translate). Normal
 * online behaviour is unchanged; the only new behaviour is what happens when
 * the server doesn't answer in time.
 *
 * If a request doesn't complete within NETWORK_FALLBACK_TIMEOUT_MS — or the
 * connection drops outright — the caller gets a chance to serve a cached
 * result from the local demo bundle (public/demo/bundle.json) instead of
 * hanging indefinitely. This only helps for input that's already in the
 * bundle (a meme/photo already run through the pipeline and saved); genuinely
 * new/improvised input has nothing to fall back to and still surfaces a real
 * error — see translateMeme.ts / encodeSpace.ts for the match-or-fail logic.
 */

export const NETWORK_FALLBACK_TIMEOUT_MS = 11_000;

/**
 * True when `err` means the request never completed — it timed out or the
 * connection failed — as opposed to the server responding with an error.
 * Only these are worth falling back on: a real HTTP error means the server
 * IS reachable, so silently swapping in canned data there would just hide an
 * actual bug instead of covering for a bad connection.
 */
export function isNetworkFailure(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (err instanceof TypeError) return true; // fetch's own "Failed to fetch" / "Load failed"
  return false;
}

/** fetch() that aborts after `timeoutMs` instead of hanging indefinitely. */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number = NETWORK_FALLBACK_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}
