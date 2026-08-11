import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EncodeSpaceResponse } from './encodeSpace';

vi.mock('../demo/demoMode', () => ({
  isDemoMode: () => false,
  isPresenterFallbackMode: vi.fn(() => false),
}));
vi.mock('../demo/recorder', () => ({
  isDemoRecordMode: () => false,
  hashImageBase64: (payload: string) => `hash:${payload}`,
}));
vi.mock('../demo/bundle', () => ({ getDemoEncode: vi.fn() }));
vi.mock('../../store/useLexiconStore', () => ({
  useLexiconStore: { getState: () => ({ getActiveLexicon: () => ({}) }) },
}));

import { encodeSpace } from './encodeSpace';
import { getDemoEncode } from '../demo/bundle';
import { isPresenterFallbackMode } from '../demo/demoMode';
import { NETWORK_FALLBACK_TIMEOUT_MS } from './networkTimeout';

const CANNED_RESULT: EncodeSpaceResponse = { reasoning: 'cached', cubes: [] };

function neverRespondingFetch() {
  return vi.fn((_url: string, init: RequestInit) => {
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted.', 'AbortError')),
      );
    });
  });
}

describe('encodeSpace — network fallback (?presenting only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('serves the saved reading when the server times out and this exact photo was saved before', async () => {
    vi.mocked(isPresenterFallbackMode).mockReturnValue(true);
    vi.stubGlobal('fetch', neverRespondingFetch());
    vi.mocked(getDemoEncode).mockResolvedValue(CANNED_RESULT);

    const promise = encodeSpace({ imageBase64: 'known-photo-bytes' });
    await vi.advanceTimersByTimeAsync(NETWORK_FALLBACK_TIMEOUT_MS);

    await expect(promise).resolves.toBe(CANNED_RESULT);
    expect(getDemoEncode).toHaveBeenCalledWith('hash:known-photo-bytes');
  });

  it('throws a clear error when the server times out and this photo has no saved reading', async () => {
    vi.mocked(isPresenterFallbackMode).mockReturnValue(true);
    vi.stubGlobal('fetch', neverRespondingFetch());
    vi.mocked(getDemoEncode).mockRejectedValue(new Error('no recorded encode'));

    const promise = encodeSpace({ imageBase64: 'new-improvised-photo' });
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(NETWORK_FALLBACK_TIMEOUT_MS);

    await expect(promise).rejects.toThrow(/nothing to fall back on/);
  });

  it('does not fall back on a real server error (server was reachable)', async () => {
    vi.mocked(isPresenterFallbackMode).mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 })),
    );

    await expect(encodeSpace({ imageBase64: 'anything' })).rejects.toThrow('boom');
    expect(getDemoEncode).not.toHaveBeenCalled();
  });

  it('without ?presenting, a dropped connection is a real error — no timeout, no fallback, even if a saved match exists', async () => {
    vi.mocked(isPresenterFallbackMode).mockReturnValue(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    vi.mocked(getDemoEncode).mockResolvedValue(CANNED_RESULT);

    await expect(encodeSpace({ imageBase64: 'known-photo-bytes' })).rejects.toThrow('Failed to fetch');
    expect(getDemoEncode).not.toHaveBeenCalled();
  });
});
