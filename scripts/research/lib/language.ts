/**
 * Per-meme language label (BASELINE-1 ruling, 2026-10-11).
 *
 * Memes store no language. With `language_from: "meme-script"`, each
 * translation record's `language` is the script of its meme's own text —
 * `memeText`, or `topText` / `bottomText` for legacy documents:
 *
 *   hebrew  only Hebrew letters
 *   latin   only Latin letters
 *   mixed   both
 *   none    no letters at all (image-only memes)
 *
 * A label for analysis, not a run condition: the prompt is unchanged. An
 * optional override file (meme id → label) corrects individual memes.
 */

import type { ArchthesisMeme } from '../../../src/types/archthesis.js';

export type ScriptLanguage = 'hebrew' | 'latin' | 'mixed' | 'none';

const HEBREW = /[֐-׿]/;
const LATIN = /[A-Za-z]/;

/** The meme's own text, as the app reads it (memeText first, then the
 *  legacy top/bottom pair). Description and tags are not meme text. */
export function memeOwnText(meme: Partial<Pick<ArchthesisMeme, 'memeText' | 'topText' | 'bottomText'>>): string {
  const memeText = meme.memeText?.trim();
  if (memeText) return memeText;
  return [meme.topText, meme.bottomText].filter(Boolean).join(' / ');
}

export function classifyScript(text: string): ScriptLanguage {
  const hebrew = HEBREW.test(text);
  const latin = LATIN.test(text);
  if (hebrew && latin) return 'mixed';
  if (hebrew) return 'hebrew';
  if (latin) return 'latin';
  return 'none';
}

/** Parses an override file: a JSON object of meme id → non-empty label. */
export function parseLanguageOverrides(json: string, filePath: string): Record<string, string> {
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`language overrides ${filePath}: expected a JSON object of meme id → label`);
  }
  for (const [id, label] of Object.entries(parsed)) {
    if (typeof label !== 'string' || label.trim() === '') {
      throw new Error(`language overrides ${filePath}: label for ${id} must be a non-empty string`);
    }
  }
  return parsed as Record<string, string>;
}

/** The label a record carries for this meme. */
export function languageForMeme(
  memeId: string,
  meme: Partial<Pick<ArchthesisMeme, 'memeText' | 'topText' | 'bottomText'>>,
  overrides: Record<string, string> | null,
): string {
  return overrides?.[memeId] ?? classifyScript(memeOwnText(meme));
}
