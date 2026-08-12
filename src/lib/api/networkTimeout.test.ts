import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout, isNetworkFailure } from './networkTimeout';

describe('isNetworkFailure', () => {
  it('is true for an AbortError (timeout)', () => {
    expect(isNetworkFailure(new DOMException('aborted', 'AbortError'))).toBe(true);
  });

  it('is true for a TypeError (dropped connection / fetch failure)', () => {
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('is false for a plain Error (e.g. a real server error already surfaced)', () => {
    expect(isNetworkFailure(new Error('API error (500): boom'))).toBe(false);
  });
});

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('resolves normally when the response arrives before the timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok')));
    const res = await fetchWithTimeout('/x', {}, 10_000);
    expect(await res.text()).toBe('ok');
  });

  it('aborts the request once the timeout elapses', async () => {
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

    const promise = fetchWithTimeout('/x', {}, 5_000);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(5_000);

    await expect(promise).rejects.toThrow(/aborted/);
  });
});
