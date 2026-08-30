/**
 * Regime capture: content hashes + declared versions of every mutable input
 * that defines the measurement conditions (spec principle 2 — hash, don't
 * trust labels). Computed once per batch.
 */

import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_LEXICON } from '../../../src/prompts/lexicon.default.js';
import { DEFAULT_TRANSLATION_LEXICON } from '../../../src/prompts/translationLexicon.default.js';
import { parsePromptVersion } from '../../../src/lib/promptVersion.js';
import { hashLexicon, hashPromptFile } from '../../../src/research/hashing.js';
import type { RegimeInfo } from '../../../src/research/types';

export interface RegimeCapture {
  regime: RegimeInfo;
  /** Raw file texts, so callers assemble prompts from the exact bytes that
   *  were hashed (no second read that could race an edit). */
  twoPassPromptText: string;
  encodeGrammarText: string;
}

export const TWO_PASS_PROMPT_FILE = 'src/prompts/pataphysical-translation-v2.md';
export const ENCODE_GRAMMAR_FILE = 'src/prompts/spatial-encoding-grammar.md';

export async function captureRegime(repoRoot: string): Promise<RegimeCapture> {
  const twoPassPromptText = fs.readFileSync(path.join(repoRoot, TWO_PASS_PROMPT_FILE), 'utf-8');
  const encodeGrammarText = fs.readFileSync(path.join(repoRoot, ENCODE_GRAMMAR_FILE), 'utf-8');

  const regime: RegimeInfo = {
    prompt_hashes: {
      two_pass: await hashPromptFile(twoPassPromptText),
      encode: await hashPromptFile(encodeGrammarText),
    },
    prompt_version_declared: parsePromptVersion(twoPassPromptText),
    grammar_version_declared: parsePromptVersion(encodeGrammarText),
    spatial_lexicon_hash: await hashLexicon(DEFAULT_LEXICON),
    translation_lexicon_hash: await hashLexicon(DEFAULT_TRANSLATION_LEXICON),
  };

  return { regime, twoPassPromptText, encodeGrammarText };
}
