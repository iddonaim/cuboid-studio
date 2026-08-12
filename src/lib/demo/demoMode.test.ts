import { describe, it, expect, vi, afterEach } from 'vitest';
import { isDemoExportMode } from './demoMode';

function stubSearch(search: string) {
  vi.stubGlobal('window', { location: { search } });
}

describe('isDemoExportMode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is true for the flag exactly as documented', () => {
    stubSearch('?demoExport');
    expect(isDemoExportMode()).toBe(true);
  });

  it('is true even if address-bar autocomplete lowercased it', () => {
    stubSearch('?demoexport');
    expect(isDemoExportMode()).toBe(true);
  });

  it('is false without the flag', () => {
    stubSearch('');
    expect(isDemoExportMode()).toBe(false);
  });
});
