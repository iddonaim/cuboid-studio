import { LLMOperatorResult, TwoPassTranslationResult } from '../operators/types';
import { getActiveSiteContext } from '../storage/siteContext';
import { useTranslationLexiconStore } from '../../store/useTranslationLexiconStore';
import { isDemoMode, isPresenterFallbackMode } from '../demo/demoMode';
import { getDemoTranslation } from '../demo/bundle';
import { isDemoRecordMode } from '../demo/recorder';
import { NETWORK_FALLBACK_TIMEOUT_MS, fetchWithTimeout, isNetworkFailure } from './networkTimeout';

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
  // Offline demo: replay the real two-pass result harvested from the exported
  // compositions (keyed by meme description). The store's phased animation
  // downstream is unchanged, so the beat still reads as live.
  if (isDemoMode()) {
    return getDemoTranslation(req.memeDescription);
  }

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

  const requestInit: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...rest,
      pass_mode: 'two_pass',
      site_context: siteContext,
      translation_lexicon,
    }),
  };

  let response: Response;
  if (isPresenterFallbackMode()) {
    try {
      response = await fetchWithTimeout('/api/translate-meme', requestInit);
    } catch (err) {
      // Timeout or dropped connection (not a server error — the server never
      // answered): fall back to a cached result for this exact meme if one was
      // saved earlier. An improvised meme with no saved match still fails, with
      // a clear reason instead of a silently faked response. Only reachable
      // with `?presenting` — a normal visitor's failed request never gets a
      // stand-in result; see isPresenterFallbackMode().
      if (isNetworkFailure(err)) {
        try {
          const result = await getDemoTranslation(req.memeDescription);
          console.warn(
            `[network-fallback] translate-meme: no response within ${NETWORK_FALLBACK_TIMEOUT_MS / 1000}s — served a saved result instead.`,
          );
          return result;
        } catch {
          throw new Error(
            `Couldn't reach the server (waited ${NETWORK_FALLBACK_TIMEOUT_MS / 1000}s), and this meme hasn't been ` +
              'translated and saved before, so there is nothing to fall back on. Check the connection and try again.',
          );
        }
      }
      throw err;
    }
  } else {
    // Normal (non-presenting) path — unchanged from before this fallback
    // existed: no artificial timeout, no cached stand-in, a failure is just
    // a failure.
    response = await fetch('/api/translate-meme', requestInit);
  }

  if (!response.ok) {
    const body = await response.text();
    // The provider's raw error for a non-image meme URL is an unreadable
    // nested-JSON blob — say what actually went wrong instead. (The panel
    // probes URLs before accepting them, so this is the fallback net.)
    if (/did not return an image|file format is invalid or unsupported/i.test(body)) {
      throw new Error(
        'The meme URL did not resolve to a readable image. Use a direct link to ' +
        'the image itself (right-click the meme → "Copy image address"), then try again.',
      );
    }
    throw new Error(`API error (${response.status}): ${body}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error === 'malformed_response'
      ? `LLM returned malformed JSON. Raw: ${data.raw?.substring(0, 200)}`
      : data.error
    );
  }

  const result = data as TwoPassTranslationResult;

  // ?demoRecord: capture this translation for offline replay (keyed by the
  // exact description string, same key getDemoTranslation matches on).
  if (isDemoRecordMode()) {
    const { recordTwoPass } = await import('../demo/recorder');
    recordTwoPass({ memeDescription: req.memeDescription, result });
  }

  return result;
}
