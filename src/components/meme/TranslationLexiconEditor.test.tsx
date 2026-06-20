// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import type { User } from 'firebase/auth';

vi.mock('../../lib/projects/translationLexiconFirestore', () => ({
  listTranslationLexicons: vi.fn(),
  createTranslationLexicon: vi.fn(),
  updateTranslationLexicon: vi.fn(),
  deleteTranslationLexicon: vi.fn(),
}));

vi.mock('../../lib/storage/activeTranslationLexicon', () => ({
  getStoredActiveTranslationLexiconId: vi.fn(() => null),
  setStoredActiveTranslationLexiconId: vi.fn(),
  clearStoredActiveTranslationLexiconId: vi.fn(),
}));

const mockUseAuthContext = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

import { TranslationLexiconEditor } from './TranslationLexiconEditor';
import { useTranslationLexiconStore } from '../../store/useTranslationLexiconStore';
import * as translationLexiconFirestore from '../../lib/projects/translationLexiconFirestore';
import type { TranslationLexiconDoc } from '../../lib/projects/translationLexiconFirestore';
import {
  DEFAULT_TRANSLATION_LEXICON,
  DEFAULT_TRANSLATION_DESCRIPTIONS,
} from '../../prompts/translationLexicon.default';

const USER = { uid: 'user-1' } as User;

function makeDoc(overrides: Partial<TranslationLexiconDoc> = {}): TranslationLexiconDoc {
  return {
    id: 'lex-1',
    name: 'My Lexicon',
    ownerId: 'user-1',
    createdAt: 1000,
    updatedAt: 1000,
    lexicon: DEFAULT_TRANSLATION_LEXICON,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuthContext.mockReturnValue({ user: USER, loading: false, error: null, signIn: vi.fn(), signOut: vi.fn() });
  useTranslationLexiconStore.setState({ lexicons: [], loading: false, activeLexiconId: null });
  vi.mocked(translationLexiconFirestore.listTranslationLexicons).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

describe('TranslationLexiconEditor', () => {
  it('prompts sign-in instead of rendering the editor when there is no user', () => {
    mockUseAuthContext.mockReturnValue({ user: null, loading: false, error: null, signIn: vi.fn(), signOut: vi.fn() });

    render(<TranslationLexiconEditor />);

    expect(screen.getByText(/Sign in to create and use custom translation lexicons/)).toBeTruthy();
    expect(screen.queryByText('Library')).toBeNull();
  });

  it('renders the built-in default as the active vocabulary for a signed-in user with no saved lexicons', async () => {
    render(<TranslationLexiconEditor />);

    expect(await screen.findByText('Default')).toBeTruthy();
  });

  it('saves a new draft and switches the active vocabulary to it', async () => {
    const created = makeDoc({ id: 'lex-new', name: 'My New Lexicon' });
    vi.mocked(translationLexiconFirestore.createTranslationLexicon).mockResolvedValue(created);

    render(<TranslationLexiconEditor />);
    await screen.findByText('Default');

    fireEvent.click(screen.getByText('Edit'));

    // The "name" field is the first textbox rendered in the editor form.
    const nameInput = screen.getAllByRole('textbox')[0];
    fireEvent.change(nameInput, { target: { value: 'My New Lexicon' } });

    fireEvent.click(screen.getByText('Save as new'));

    await waitFor(() => expect(useTranslationLexiconStore.getState().activeLexiconId).toBe('lex-new'));

    expect(translationLexiconFirestore.createTranslationLexicon).toHaveBeenCalledWith(
      'user-1',
      'My New Lexicon',
      DEFAULT_TRANSLATION_LEXICON,
      { tags: [], descriptions: DEFAULT_TRANSLATION_DESCRIPTIONS },
    );
    expect(await screen.findByText('My New Lexicon')).toBeTruthy();
  });

  it('switches the active vocabulary when a saved lexicon is activated from the library', async () => {
    const doc = makeDoc({ id: 'lex-1', name: 'Tel Aviv' });
    vi.mocked(translationLexiconFirestore.listTranslationLexicons).mockResolvedValue([doc]);

    render(<TranslationLexiconEditor />);
    await waitFor(() => expect(useTranslationLexiconStore.getState().lexicons).toHaveLength(1));

    fireEvent.click(screen.getByText('Library'));

    const row = screen.getByText('Tel Aviv').closest('div')!.parentElement!;
    fireEvent.click(within(row).getByText('Activate'));

    expect(useTranslationLexiconStore.getState().activeLexiconId).toBe('lex-1');
    expect(within(row).getByText('Active')).toBeTruthy();
  });
});
