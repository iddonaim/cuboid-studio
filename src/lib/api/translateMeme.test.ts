import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TwoPassTranslationResult } from '../operators/types';

vi.mock('../demo/demoMode', () => ({ isDemoMode: () => false }));
vi.mock('../demo/recorder', () => ({ isDemoRecordMode: () => false }));
vi.mock('../demo/bundle', () => ({ getDemoTranslation: vi.fn() }));
vi.mock('../../store/useTranslationLexiconStore', () => ({
  useTranslationLexiconStore: { getState: () => ({ getActiveTranslationLexicon: () => ({}) }) },
}));

import { translateMemeTwoPass } from './translateMeme';
import { getDemoTranslation } from '../demo/bundle';
import { NETWORK_FALLBACK_TIMEOUT_MS } from './networkTimeout';

const CANNED_RESULT = { pass1: {}, pass2: {} } as unknown as TwoPassTranslationResult;

describe('translateMemeTwoPass — network fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('serves the saved translation when the server times out and a match exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        });
      }),
    );
    vi.mocked(getDemoTranslation).mockResolvedValue(CANNED_RESULT);

    const promise = translateMemeTwoPass({
      memeDescription: 'a known meme',
      locationTag: null,
      engagementLevel: 5,
      skipSiteContext: true,
    });

    await vi.advanceTimersByTimeAsync(NETWORK_FALLBACK_TIMEOUT_MS);

    await expect(promise).resolves.toBe(CANNED_RESULT);
    expect(getDemoTranslation).toHaveBeenCalledWith('a known meme');
  });

  it('throws a clear error when the server times out and nothing is saved for this meme', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        });
      }),
    );
    vi.mocked(getDemoTranslation).mockRejectedValue(new Error('no canned translation'));

    const promise = translateMemeTwoPass({
      memeDescription: 'an improvised meme',
      locationTag: null,
      engagementLevel: 5,
      skipSiteContext: true,
    });
    // Prevent an unhandled-rejection warning before the assertion below awaits it.
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(NETWORK_FALLBACK_TIMEOUT_MS);

    await expect(promise).rejects.toThrow(/nothing to fall back on/);
  });

  it('does not fall back on a real server error (server was reachable)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 })),
    );

    await expect(
      translateMemeTwoPass({
        memeDescription: 'anything',
        locationTag: null,
        engagementLevel: 5,
        skipSiteContext: true,
      }),
    ).rejects.toThrow(/API error \(500\)/);
    expect(getDemoTranslation).not.toHaveBeenCalled();
  });
});
