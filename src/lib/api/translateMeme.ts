import { LLMOperatorResult, TwoPassTranslationResult } from '../operators/types';
import { getActiveSiteContext } from '../storage/siteContext';
import { useTranslationLexiconStore } from '../../store/useTranslationLexiconStore';

export interface TranslateMemeRequest {
  memeDescription: string;
  locationTag: string | null;
  engagementLevel: number;
  memeImageUrl?: string | null;
}

/**
 * v1 translation — single-pass, flat LLMOperatorResult.
 *
 * Used by Evolution mode and v1 Pataphysical mode. Always requests
 * pass_mode=single regardless of the server's TRANSLATION_PASS_MODE
 * env var, so callers are immune to server-side flag changes.
 */
export async function translateMeme(req: TranslateMemeRequest): Promise<LLMOperatorResult> {
  const response = await fetch('/api/translate-meme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...req,
      pass_mode: 'single',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API error (${response.status}): ${body}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error === 'malformed_response'
      ? `LLM returned malformed JSON. Raw: ${data.raw?.substring(0, 200)}`
      : data.error
    );
  }

  return data as LLMOperatorResult;
}

export interface TranslateMemeV2Request extends TranslateMemeRequest {
  model?: string;
  /** Override site context. If omitted, reads from localStorage via getActiveSiteContext(). */
  site_context?: object | null;
  /** Set to true to skip automatic site context injection. */
  skipSiteContext?: boolean;
}

/**
 * v2 translation — two-pass, returns { pass1, pass2, model }.
 *
 * Used by Pataphysical v2 mode (Phase 2 frontend). Automatically injects
 * the active site context from localStorage unless skipSiteContext is true
 * or an explicit site_context is provided.
 */
export async function translateMemeTwoPass(req: TranslateMemeV2Request): Promise<TwoPassTranslationResult> {
  // Resolve site context
  let siteContext = req.site_context;
  if (siteContext === undefined && !req.skipSiteContext) {
    siteContext = getActiveSiteContext();
  }

  const { skipSiteContext, site_context: _ignored, ...rest } = req;

  // Send the active translation lexicon so the server composes the v2 prompt's
  // vocabulary from it. A null active id resolves to DEFAULT_TRANSLATION_LEXICON
  // inside getActiveTranslationLexicon(), which composes byte-identically to the
  // original prompt — so default behaviour is unchanged.
  const translation_lexicon = useTranslationLexiconStore.getState().getActiveTranslationLexicon();

  const response = await fetch('/api/translate-meme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...rest,
      pass_mode: 'two_pass',
      site_context: siteContext,
      translation_lexicon,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API error (${response.status}): ${body}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error === 'malformed_response'
      ? `LLM returned malformed JSON. Raw: ${data.raw?.substring(0, 200)}`
      : data.error
    );
  }

  return data as TwoPassTranslationResult;
}
