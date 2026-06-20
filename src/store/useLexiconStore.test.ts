import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpatialLexicon } from '../prompts/lexicon.default';
import { DEFAULT_LEXICON } from '../prompts/lexicon.default';
import type { LexiconDoc } from '../lib/projects/lexiconFirestore';

vi.mock('../lib/projects/lexiconFirestore', () => ({
  listLexicons: vi.fn(),
  createLexicon: vi.fn(),
  updateLexicon: vi.fn(),
  deleteLexicon: vi.fn(),
}));

vi.mock('../lib/storage/activeLexicon', () => ({
  getStoredActiveLexiconId: vi.fn(() => null),
  setStoredActiveLexiconId: vi.fn(),
  clearStoredActiveLexiconId: vi.fn(),
}));

import { useLexiconStore } from './useLexiconStore';
import * as lexiconFirestore from '../lib/projects/lexiconFirestore';
import * as activeLexiconStorage from '../lib/storage/activeLexicon';

const CUSTOM_LEXICON = {} as SpatialLexicon;

function makeDoc(overrides: Partial<LexiconDoc> = {}): LexiconDoc {
  return {
    id: 'lex-1',
    name: 'My Lexicon',
    ownerId: 'owner-1',
    createdAt: 1000,
    updatedAt: 1000,
    lexicon: CUSTOM_LEXICON,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useLexiconStore.setState({ lexicons: [], loading: false, activeLexiconId: null });
});

describe('getActiveLexicon', () => {
  it('returns DEFAULT_LEXICON when activeLexiconId is null', () => {
    useLexiconStore.setState({ activeLexiconId: null, lexicons: [] });
    expect(useLexiconStore.getState().getActiveLexicon()).toBe(DEFAULT_LEXICON);
  });

  it('returns the matching doc lexicon when activeLexiconId resolves', () => {
    const doc = makeDoc({ id: 'lex-1' });
    useLexiconStore.setState({ activeLexiconId: 'lex-1', lexicons: [doc] });
    expect(useLexiconStore.getState().getActiveLexicon()).toBe(CUSTOM_LEXICON);
  });

  it('falls back to DEFAULT_LEXICON when activeLexiconId has no matching doc (defensive ?? branch)', () => {
    useLexiconStore.setState({ activeLexiconId: 'ghost-id', lexicons: [makeDoc({ id: 'lex-1' })] });
    expect(useLexiconStore.getState().getActiveLexicon()).toBe(DEFAULT_LEXICON);
  });
});

describe('loadLexicons', () => {
  it('falls back to null and clears storage when the stored active id is stale', async () => {
    vi.mocked(lexiconFirestore.listLexicons).mockResolvedValue([makeDoc({ id: 'lex-2' })]);
    useLexiconStore.setState({ activeLexiconId: 'lex-1' });

    await useLexiconStore.getState().loadLexicons('owner-1');

    expect(useLexiconStore.getState().activeLexiconId).toBeNull();
    expect(activeLexiconStorage.clearStoredActiveLexiconId).toHaveBeenCalledTimes(1);
  });

  it('keeps a valid active id unchanged and does not clear storage', async () => {
    const doc = makeDoc({ id: 'lex-1' });
    vi.mocked(lexiconFirestore.listLexicons).mockResolvedValue([doc]);
    useLexiconStore.setState({ activeLexiconId: 'lex-1' });

    await useLexiconStore.getState().loadLexicons('owner-1');

    expect(useLexiconStore.getState().activeLexiconId).toBe('lex-1');
    expect(activeLexiconStorage.clearStoredActiveLexiconId).not.toHaveBeenCalled();
  });

  it('leaves a null active id as null without touching storage', async () => {
    vi.mocked(lexiconFirestore.listLexicons).mockResolvedValue([makeDoc({ id: 'lex-1' })]);
    useLexiconStore.setState({ activeLexiconId: null });

    await useLexiconStore.getState().loadLexicons('owner-1');

    expect(useLexiconStore.getState().activeLexiconId).toBeNull();
    expect(activeLexiconStorage.clearStoredActiveLexiconId).not.toHaveBeenCalled();
  });
});

describe('createLexicon', () => {
  it('prepends the new doc (newest-first)', async () => {
    const existing = makeDoc({ id: 'lex-old' });
    useLexiconStore.setState({ lexicons: [existing] });
    const created = makeDoc({ id: 'lex-new' });
    vi.mocked(lexiconFirestore.createLexicon).mockResolvedValue(created);

    const result = await useLexiconStore.getState().createLexicon('owner-1', 'New', CUSTOM_LEXICON);

    expect(result).toBe(created);
    expect(useLexiconStore.getState().lexicons.map(l => l.id)).toEqual(['lex-new', 'lex-old']);
  });
});

describe('updateLexicon', () => {
  it('patches the matching doc in place and stamps a fresh updatedAt', async () => {
    const doc = makeDoc({ id: 'lex-1', name: 'Old Name', updatedAt: 1000 });
    const other = makeDoc({ id: 'lex-2', name: 'Untouched', updatedAt: 500 });
    useLexiconStore.setState({ lexicons: [doc, other] });
    vi.mocked(lexiconFirestore.updateLexicon).mockResolvedValue(undefined);

    const before = Date.now();
    await useLexiconStore.getState().updateLexicon('lex-1', { name: 'New Name' });

    const updated = useLexiconStore.getState().lexicons.find(l => l.id === 'lex-1')!;
    expect(updated.name).toBe('New Name');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
    expect(useLexiconStore.getState().lexicons.find(l => l.id === 'lex-2')).toEqual(other);
  });
});

describe('deleteLexicon', () => {
  it('resets activeLexiconId to null and clears storage when the deleted doc was active', async () => {
    const doc = makeDoc({ id: 'lex-1' });
    useLexiconStore.setState({ lexicons: [doc], activeLexiconId: 'lex-1' });
    vi.mocked(lexiconFirestore.deleteLexicon).mockResolvedValue(undefined);

    await useLexiconStore.getState().deleteLexicon('lex-1');

    expect(useLexiconStore.getState().lexicons).toHaveLength(0);
    expect(useLexiconStore.getState().activeLexiconId).toBeNull();
    expect(activeLexiconStorage.clearStoredActiveLexiconId).toHaveBeenCalledTimes(1);
  });

  it('does not reset activeLexiconId when deleting a non-active doc', async () => {
    const active = makeDoc({ id: 'lex-active' });
    const target = makeDoc({ id: 'lex-2' });
    useLexiconStore.setState({ lexicons: [active, target], activeLexiconId: 'lex-active' });
    vi.mocked(lexiconFirestore.deleteLexicon).mockResolvedValue(undefined);

    await useLexiconStore.getState().deleteLexicon('lex-2');

    expect(useLexiconStore.getState().lexicons.map(l => l.id)).toEqual(['lex-active']);
    expect(useLexiconStore.getState().activeLexiconId).toBe('lex-active');
    expect(activeLexiconStorage.clearStoredActiveLexiconId).not.toHaveBeenCalled();
  });
});

describe('duplicateLexicon', () => {
  it('names the copy "${name} (copy)" and clones tags/descriptions', async () => {
    const source = makeDoc({
      id: 'lex-1',
      name: 'Original',
      tags: ['residential'],
      descriptions: { atmosphere: 'note' },
    });
    useLexiconStore.setState({ lexicons: [source] });
    const copy = makeDoc({ id: 'lex-copy', name: 'Original (copy)' });
    vi.mocked(lexiconFirestore.createLexicon).mockResolvedValue(copy);

    const result = await useLexiconStore.getState().duplicateLexicon('lex-1', 'owner-1');

    expect(lexiconFirestore.createLexicon).toHaveBeenCalledWith(
      'owner-1',
      'Original (copy)',
      source.lexicon,
      expect.objectContaining({ tags: ['residential'], descriptions: { atmosphere: 'note' } }),
    );
    expect(result).toBe(copy);
  });

  it('throws if the source id does not exist', async () => {
    useLexiconStore.setState({ lexicons: [] });
    await expect(useLexiconStore.getState().duplicateLexicon('missing', 'owner-1')).rejects.toThrow(
      /not found/,
    );
  });
});

describe('setActiveLexiconId', () => {
  it('clears stored id when set to null', () => {
    useLexiconStore.getState().setActiveLexiconId(null);
    expect(activeLexiconStorage.clearStoredActiveLexiconId).toHaveBeenCalledTimes(1);
    expect(activeLexiconStorage.setStoredActiveLexiconId).not.toHaveBeenCalled();
    expect(useLexiconStore.getState().activeLexiconId).toBeNull();
  });

  it('persists a real id', () => {
    useLexiconStore.getState().setActiveLexiconId('lex-1');
    expect(activeLexiconStorage.setStoredActiveLexiconId).toHaveBeenCalledWith('lex-1');
    expect(activeLexiconStorage.clearStoredActiveLexiconId).not.toHaveBeenCalled();
    expect(useLexiconStore.getState().activeLexiconId).toBe('lex-1');
  });
});
