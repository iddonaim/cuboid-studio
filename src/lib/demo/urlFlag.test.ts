import { describe, it, expect, vi, afterEach } from 'vitest';
import { hasUrlFlag } from './urlFlag';

function stubSearch(search: string) {
  vi.stubGlobal('window', { location: { search } });
}

describe('hasUrlFlag', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('matches the flag as typed', () => {
    stubSearch('?demoExport');
    expect(hasUrlFlag('demoExport')).toBe(true);
  });

  it('matches regardless of how the flag was capitalised in the URL', () => {
    stubSearch('?demoexport');
    expect(hasUrlFlag('demoExport')).toBe(true);
  });

  it('matches regardless of how the flag was capitalised in the caller', () => {
    stubSearch('?DEMOEXPORT');
    expect(hasUrlFlag('demoExport')).toBe(true);
  });

  it('is false when the flag is absent', () => {
    stubSearch('?somethingElse=1');
    expect(hasUrlFlag('demoExport')).toBe(false);
  });

  it('is false outside a browser context (no window)', () => {
    expect(hasUrlFlag('demoExport')).toBe(false);
  });
});
