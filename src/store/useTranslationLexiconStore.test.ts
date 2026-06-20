import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TranslationLexicon } from '../prompts/translationLexicon.default';
import { DEFAULT_TRANSLATION_LEXICON } from '../prompts/translationLexicon.default';
import type { TranslationLexiconDoc } from '../lib/projects/translationLexiconFirestore';

vi.mock('../lib/projects/translationLexiconFirestore', () => ({
  listTranslationLexicons: vi.fn(),
  createTranslationLexicon: vi.fn(),
  updateTranslationLexicon: vi.fn(),
  deleteTranslationLexicon: vi.fn(),
}));

vi.mock('../lib/storage/activeTranslationLexicon', () => ({
  getStoredActiveTranslationLexiconId: vi.fn(() => null),
  setStoredActiveTranslationLexiconId: vi.fn(),
  clearStoredActiveTranslationLexiconId: vi.fn(),
}));

import { useTranslationLexiconStore } from './useTranslationLexiconStore';
import * as translationLexiconFirestore from '../lib/projects/translationLexiconFirestore';
import * as activeTranslationLexiconStorage from '../lib/storage/activeTranslationLexicon';

const CUSTOM_LEXICON = {} as TranslationLexicon;

function makeDoc(overrides: Partial<TranslationLexiconDoc> = {}): TranslationLexiconDoc {
  return {
    id: 'lex-1',
    name: 'My Translation Lexicon',
    ownerId: 'owner-1',
    createdAt: 1000,
    updatedAt: 1000,
    lexicon: CUSTOM_LEXICON,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useTranslationLexiconStore.setState({ lexicons: [], loading: false, activeLexiconId: null });
});

describe('getActiveTranslationLexicon', () => {
  it('returns DEFAULT_TRANSLATION_LEXICON when activeLexiconId is null', () => {
    useTranslationLexiconStore.setState({ activeLexiconId: null, lexicons: [] });
    expect(useTranslationLexiconStore.getState().getActiveTranslationLexicon()).toBe(
      DEFAULT_TRANSLATION_LEXICON,
    );
  });

  it('returns the matching doc lexicon when activeLexiconId resolves', () => {
    const doc = makeDoc({ id: 'lex-1' });
    useTranslationLexiconStore.setState({ activeLexiconId: 'lex-1', lexicons: [doc] });
    expect(useTranslationLexiconStore.getState().getActiveTranslationLexicon()).toBe(CUSTOM_LEXICON);
  });

  it('falls back to DEFAULT_TRANSLATION_LEXICON when activeLexiconId has no matching doc (defensive ?? branch)', () => {
    useTranslationLexiconStore.setState({
      activeLexiconId: 'ghost-id',
      lexicons: [makeDoc({ id: 'lex-1' })],
    });
    expect(useTranslationLexiconStore.getState().getActiveTranslationLexicon()).toBe(
      DEFAULT_TRANSLATION_LEXICON,
    );
  });
});

describe('loadLexicons', () => {
  it('falls back to null and clears storage when the stored active id is stale', async () => {
    vi.mocked(translationLexiconFirestore.listTranslationLexicons).mockResolvedValue([
      makeDoc({ id: 'lex-2' }),
    ]);
    useTranslationLexiconStore.setState({ activeLexiconId: 'lex-1' });

    await useTranslationLexiconStore.getState().loadLexicons('owner-1');

    expect(useTranslationLexiconStore.getState().activeLexiconId).toBeNull();
    expect(activeTranslationLexiconStorage.clearStoredActiveTranslationLexiconId).toHaveBeenCalledTimes(1);
  });

  it('keeps a valid active id unchanged and does not clear storage', async () => {
    const doc = makeDoc({ id: 'lex-1' });
    vi.mocked(translationLexiconFirestore.listTranslationLexicons).mockResolvedValue([doc]);
    useTranslationLexiconStore.setState({ activeLexiconId: 'lex-1' });

    await useTranslationLexiconStore.getState().loadLexicons('owner-1');

    expect(useTranslationLexiconStore.getState().activeLexiconId).toBe('lex-1');
    expect(activeTranslationLexiconStorage.clearStoredActiveTranslationLexiconId).not.toHaveBeenCalled();
  });

  it('leaves a null active id as null without touching storage', async () => {
    vi.mocked(translationLexiconFirestore.listTranslationLexicons).mockResolvedValue([
      makeDoc({ id: 'lex-1' }),
    ]);
    useTranslationLexiconStore.setState({ activeLexiconId: null });

    await useTranslationLexiconStore.getState().loadLexicons('owner-1');

    expect(useTranslationLexiconStore.getState().activeLexiconId).toBeNull();
    expect(activeTranslationLexiconStorage.clearStoredActiveTranslationLexiconId).not.toHaveBeenCalled();
  });
});

describe('createLexicon', () => {
  it('prepends the new doc (newest-first)', async () => {
    const existing = makeDoc({ id: 'lex-old' });
    useTranslationLexiconStore.setState({ lexicons: [existing] });
    const created = makeDoc({ id: 'lex-new' });
    vi.mocked(translationLexiconFirestore.createTranslationLexicon).mockResolvedValue(created);

    const result = await useTranslationLexiconStore
      .getState()
      .createLexicon('owner-1', 'New', CUSTOM_LEXICON);

    expect(result).toBe(created);
    expect(useTranslationLexiconStore.getState().lexicons.map(l => l.id)).toEqual(['lex-new', 'lex-old']);
  });
});

describe('updateLexicon', () => {
  it('patches the matching doc in place and stamps a fresh updatedAt', async () => {
    const doc = makeDoc({ id: 'lex-1', name: 'Old Name', updatedAt: 1000 });
    const other = makeDoc({ id: 'lex-2', name: 'Untouched', updatedAt: 500 });
    useTranslationLexiconStore.setState({ lexicons: [doc, other] });
    vi.mocked(translationLexiconFirestore.updateTranslationLexicon).mockResolvedValue(undefined);

    const before = Date.now();
    await useTranslationLexiconStore.getState().updateLexicon('lex-1', { name: 'New Name' });

    const updated = useTranslationLexiconStore.getState().lexicons.find(l => l.id === 'lex-1')!;
    expect(updated.name).toBe('New Name');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
    expect(useTranslationLexiconStore.getState().lexicons.find(l => l.id === 'lex-2')).toEqual(other);
  });
});

describe('deleteLexicon', () => {
  it('resets activeLexiconId to null and clears storage when the deleted doc was active', async () => {
    const doc = makeDoc({ id: 'lex-1' });
    useTranslationLexiconStore.setState({ lexicons: [doc], activeLexiconId: 'lex-1' });
    vi.mocked(translationLexiconFirestore.deleteTranslationLexicon).mockResolvedValue(undefined);

    await useTranslationLexiconStore.getState().deleteLexicon('lex-1');

    expect(useTranslationLexiconStore.getState().lexicons).toHaveLength(0);
    expect(useTranslationLexiconStore.getState().activeLexiconId).toBeNull();
    expect(activeTranslationLexiconStorage.clearStoredActiveTranslationLexiconId).toHaveBeenCalledTimes(1);
  });

  it('does not reset activeLexiconId when deleting a non-active doc', async () => {
    const active = makeDoc({ id: 'lex-active' });
    const target = makeDoc({ id: 'lex-2' });
    useTranslationLexiconStore.setState({ lexicons: [active, target], activeLexiconId: 'lex-active' });
    vi.mocked(translationLexiconFirestore.deleteTranslationLexicon).mockResolvedValue(undefined);

    await useTranslationLexiconStore.getState().deleteLexicon('lex-2');

    expect(useTranslationLexiconStore.getState().lexicons.map(l => l.id)).toEqual(['lex-active']);
    expect(useTranslationLexiconStore.getState().activeLexiconId).toBe('lex-active');
    expect(activeTranslationLexiconStorage.clearStoredActiveTranslationLexiconId).not.toHaveBeenCalled();
  });
});

describe('duplicateLexicon', () => {
  it('names the copy "${name} (copy)" and clones tags/descriptions', async () => {
    const source = makeDoc({
      id: 'lex-1',
      name: 'Original',
      tags: ['museum'],
      descriptions: { decay: 'note' },
    });
    useTranslationLexiconStore.setState({ lexicons: [source] });
    const copy = makeDoc({ id: 'lex-copy', name: 'Original (copy)' });
    vi.mocked(translationLexiconFirestore.createTranslationLexicon).mockResolvedValue(copy);

    const result = await useTranslationLexiconStore.getState().duplicateLexicon('lex-1', 'owner-1');

    expect(translationLexiconFirestore.createTranslationLexicon).toHaveBeenCalledWith(
      'owner-1',
      'Original (copy)',
      source.lexicon,
      expect.objectContaining({ tags: ['museum'], descriptions: { decay: 'note' } }),
    );
    expect(result).toBe(copy);
  });

  it('throws if the source id does not exist', async () => {
    useTranslationLexiconStore.setState({ lexicons: [] });
    await expect(
      useTranslationLexiconStore.getState().duplicateLexicon('missing', 'owner-1'),
    ).rejects.toThrow(/not found/);
  });
});

describe('setActiveLexiconId', () => {
  it('clears stored id when set to null', () => {
    useTranslationLexiconStore.getState().setActiveLexiconId(null);
    expect(activeTranslationLexiconStorage.clearStoredActiveTranslationLexiconId).toHaveBeenCalledTimes(1);
    expect(activeTranslationLexiconStorage.setStoredActiveTranslationLexiconId).not.toHaveBeenCalled();
    expect(useTranslationLexiconStore.getState().activeLexiconId).toBeNull();
  });

  it('persists a real id', () => {
    useTranslationLexiconStore.getState().setActiveLexiconId('lex-1');
    expect(activeTranslationLexiconStorage.setStoredActiveTranslationLexiconId).toHaveBeenCalledWith(
      'lex-1',
    );
    expect(activeTranslationLexiconStorage.clearStoredActiveTranslationLexiconId).not.toHaveBeenCalled();
    expect(useTranslationLexiconStore.getState().activeLexiconId).toBe('lex-1');
  });
});
