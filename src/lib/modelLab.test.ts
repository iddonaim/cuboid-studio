// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { isModelLabEnabled, syncModelLabFlagFromUrl } from './modelLab';

const STORAGE_KEY = 'cuboid:modelLabEnabled';

function setSearch(search: string) {
  window.history.replaceState({}, '', `/${search}`);
}

describe('modelLab flag', () => {
  beforeEach(() => {
    localStorage.clear();
    setSearch('');
  });

  it('is off by default (archived)', () => {
    expect(isModelLabEnabled()).toBe(false);
  });

  it('?modellab=1 turns it on and persists', () => {
    setSearch('?modellab=1');
    syncModelLabFlagFromUrl();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
    expect(isModelLabEnabled()).toBe(true);
  });

  it('stays on across navigation once remembered', () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setSearch(''); // no param on a later page load
    syncModelLabFlagFromUrl();
    expect(isModelLabEnabled()).toBe(true);
  });

  it('?modellab=0 turns it off again and forgets it', () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setSearch('?modellab=0');
    syncModelLabFlagFromUrl();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(isModelLabEnabled()).toBe(false);
  });

  it('leaves a remembered preference untouched when no param is present', () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setSearch('?other=thing');
    syncModelLabFlagFromUrl();
    expect(isModelLabEnabled()).toBe(true);
  });
});
