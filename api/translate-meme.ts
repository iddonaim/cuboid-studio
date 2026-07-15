import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_TRANSLATION_LEXICON,
  composeTranslationPrompt,
  isTranslationLexicon,
} from '../src/prompts/translationLexicon.default.js';
import { toAnthropicModelId } from '../src/lib/models.js';

/**
 * Vercel serverless function: POST /api/translate-meme
 *
 * Translates a meme description into spatial operator parameters
 * using the pataphysical translation system prompt via OpenRouter
 * (or an Anthropic-native fallback when OPENROUTER_API_KEY isn't set).
 *
 * Pass mode is selected per-request via the `pass_mode` field:
 *   "single"   — v1 behavior: single-pass, flat JSON object response.
 *                Uses src/prompts/pataphysical-translation.md
 *   "two_pass" — v2 behavior: two-pass, JSON array [Pass1, Pass2].
 *                Uses src/prompts/pataphysical-translation-v2.md
 *                Supports site_context injection.
 *
 * The system prompt is loaded from disk at runtime — the architect can edit
 * the prompt file to change translation behavior without any code changes.
 */

// Default model for translation, overridable per deployment via the
// TRANSLATION_MODEL env var (OpenRouter-style id) and per request via the
// `model` body field. Model strategy: docs/MODEL_STRATEGY.md.
const DEFAULT_MODEL = process.env.TRANSLATION_MODEL?.trim() || 'anthropic/claude-sonnet-4.6';

// Response token ceilings. Sized for newer-generation models whose tokenizers
// count ~30% more tokens for the same text — a two-pass answer that fit in
// 2000 tokens on Sonnet 4 truncates mid-JSON on Sonnet 5 (observed live,
// 2026-07-12). Ceilings are upper bounds, not spend: only actually generated
// tokens cost time and money.
const MAX_TOKENS_TWO_PASS = 4096;
const MAX_TOKENS_SINGLE = 1500;

type PassMode = 'single' | 'two_pass';

/**
 * Guard against SSRF when the server fetches a user-supplied image URL.
 * Accepts only https:// URLs whose host is not a private/loopback/link-local
 * address or cloud metadata IP.
 */
function isSafePublicHttpsUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  // Block IP literals pointing at private/loopback/link-local/metadata ranges.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 169 && b === 254) return false; // link-local + AWS/GCP metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 0) return false;
  }
  // Block IPv6 loopback / unique-local / link-local in bracketed form.
  if (host.startsWith('[')) {
    const v6 = host.slice(1, -1);
    if (v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80')) return false;
  }
  return true;
}

function resolvePassMode(requestOverride?: unknown): PassMode {
  return requestOverride === 'two_pass' ? 'two_pass' : 'single';
}

function buildUserMessage(memeDescription: string, locationTag: string | null, engagement: number): string {
  return [
    `Meme description: ${memeDescription}`,
    locationTag ? `Location: ${locationTag}` : 'Location: none specified',
    `Engagement level: ${engagement}/100`,
  ].join('\n');
}

function stripCodeFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
}

/**
 * Runs the model, strips fences, parses JSON, retries once with an explicit
 * JSON instruction on parse failure, and dispatches to the appropriate
 * validator. `caller(retry?)` is the transport-specific closure that hits
 * OpenRouter or Anthropic.
 */
export async function parseAndRoute(
  res: VercelResponse,
  caller: (retryMessage?: string) => Promise<string>,
  userMessage: string,
  passMode: PassMode,
  selectedModel: string,
): Promise<VercelResponse> {
  const validate = (value: any): ValidationResult =>
    passMode === 'two_pass'
      ? validateAndReturnTwoPass(value, selectedModel)
      : validateAndReturnSingle(value);

  let parsed: any;
  try {
    const rawText = stripCodeFences(await caller());
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.log('First parse failed, retrying with explicit JSON instruction');
      const retry = stripCodeFences(await caller(
        userMessage + '\n\nIMPORTANT: Return ONLY valid JSON. No markdown fences, no backticks, no explanation outside the JSON.'
      ));
      try {
        parsed = JSON.parse(retry);
      } catch {
        return res.status(422).json({
          error: 'malformed_response',
          raw: retry.substring(0, 500),
        });
      }
    }
  } catch (error) {
    console.error('Translation error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Translation failed',
    });
  }

  // The JSON parsed, but a value may be semantically invalid (e.g. an operator
  // outside the allowed set, which the model occasionally emits by reaching for
  // a rhetorical-move name instead of an operator class). Re-ask the model once,
  // quoting the exact validation error, before giving up.
  let result = validate(parsed);
  if (!result.ok) {
    console.log('Validation failed, retrying with corrective instruction:', result.error);
    try {
      const retryText = stripCodeFences(await caller(
        userMessage +
        `\n\nYour previous response was rejected for this reason: ${result.error}. ` +
        'Return ONLY corrected, valid JSON that satisfies this constraint. ' +
        'No markdown fences, no backticks, no explanation outside the JSON.'
      ));
      result = validate(JSON.parse(retryText));
    } catch (retryErr) {
      // Keep the original validation error if the retry itself fails to parse.
      console.log('Validation retry failed to parse, returning original error:', retryErr);
    }
  }

  if (!result.ok) {
    return res.status(422).json({
      error: result.error,
      raw: JSON.stringify(result.raw).substring(0, 500),
    });
  }
  return res.status(200).json(result.payload);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    memeDescription,
    locationTag,
    engagementLevel,
    memeImageUrl,
    model,
    site_context,
    pass_mode,
    translation_lexicon,
  } = req.body || {};

  if (!memeDescription || typeof memeDescription !== 'string') {
    return res.status(400).json({ error: 'memeDescription is required' });
  }

  // Size caps — protect against runaway token spend on adversarial/accidental
  // large inputs. Values chosen to comfortably cover realistic usage.
  const MAX_MEME_DESCRIPTION = 8_000;       // ~8 KB of prose
  const MAX_LOCATION_TAG = 256;
  const MAX_SITE_CONTEXT_CHARS = 32_000;    // ~32 KB stringified
  const MAX_TRANSLATION_LEXICON_CHARS = 32_000; // ~32 KB stringified

  if (memeDescription.length > MAX_MEME_DESCRIPTION) {
    return res.status(413).json({ error: `memeDescription too long (max ${MAX_MEME_DESCRIPTION} chars)` });
  }
  if (typeof locationTag === 'string' && locationTag.length > MAX_LOCATION_TAG) {
    return res.status(413).json({ error: `locationTag too long (max ${MAX_LOCATION_TAG} chars)` });
  }
  if (site_context !== undefined && site_context !== null) {
    const siteContextSize = typeof site_context === 'string'
      ? site_context.length
      : JSON.stringify(site_context).length;
    if (siteContextSize > MAX_SITE_CONTEXT_CHARS) {
      return res.status(413).json({ error: `site_context too large (max ${MAX_SITE_CONTEXT_CHARS} chars)` });
    }
  }
  if (translation_lexicon !== undefined && translation_lexicon !== null
      && JSON.stringify(translation_lexicon).length > MAX_TRANSLATION_LEXICON_CHARS) {
    return res.status(413).json({ error: `translation_lexicon too large (max ${MAX_TRANSLATION_LEXICON_CHARS} chars)` });
  }

  const engagement = typeof engagementLevel === 'number'
    ? Math.max(0, Math.min(100, engagementLevel))
    : 50;

  const passMode = resolvePassMode(pass_mode);
  const selectedModel = (typeof model === 'string' && model.trim()) ? model.trim() : DEFAULT_MODEL;

  // Load the appropriate prompt file.
  const promptFile = passMode === 'two_pass'
    ? 'pataphysical-translation-v2.md'
    : 'pataphysical-translation.md';

  let systemPrompt: string;
  try {
    const promptPath = path.join(process.cwd(), 'src', 'prompts', promptFile);
    systemPrompt = fs.readFileSync(promptPath, 'utf-8');
  } catch (err) {
    console.error('Failed to load system prompt:', err);
    return res.status(500).json({ error: `Failed to load translation prompt: ${promptFile}` });
  }

  // Inject site context into v2 prompt. If the prompt template has drifted
  // and no longer contains the {site_context} placeholder, the replace is a
  // silent no-op — warn loudly so the breakage is visible in logs.
  if (passMode === 'two_pass' && site_context) {
    const contextStr = typeof site_context === 'string'
      ? site_context
      : JSON.stringify(site_context, null, 2);
    if (!systemPrompt.includes('{site_context}')) {
      console.warn(`Prompt ${promptFile} has no {site_context} placeholder — site context was NOT injected`);
    }
    systemPrompt = systemPrompt.replace('{site_context}', contextStr);
  }

  // Fill the v2 prompt's vocabulary slots ({{...}}) from the active translation
  // lexicon. A request may supply a custom lexicon; anything malformed falls
  // back to the built-in default. With the default, the composed prompt is
  // byte-identical to the original file, so default behaviour is unchanged.
  if (passMode === 'two_pass') {
    const lexicon = isTranslationLexicon(translation_lexicon)
      ? translation_lexicon
      : DEFAULT_TRANSLATION_LEXICON;
    if (translation_lexicon != null && lexicon === DEFAULT_TRANSLATION_LEXICON
        && !isTranslationLexicon(translation_lexicon)) {
      console.warn('translation_lexicon was malformed — falling back to DEFAULT_TRANSLATION_LEXICON');
    }
    systemPrompt = composeTranslationPrompt(systemPrompt, lexicon);
  }

  const userMessage = buildUserMessage(memeDescription, locationTag || null, engagement);

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    const caller = makeOpenRouterCaller({
      apiKey: openRouterKey,
      userMessage,
      memeImageUrl: typeof memeImageUrl === 'string' ? memeImageUrl : null,
      systemPrompt,
      selectedModel,
      passMode,
    });
    return parseAndRoute(res, caller, userMessage, passMode, selectedModel);
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return res.status(500).json({ error: 'Neither OPENROUTER_API_KEY nor ANTHROPIC_API_KEY configured' });
  }
  const caller = await makeAnthropicCaller({
    apiKey: anthropicKey,
    userMessage,
    memeImageUrl: typeof memeImageUrl === 'string' ? memeImageUrl : null,
    systemPrompt,
    selectedModel,
    passMode,
  });
  return parseAndRoute(res, caller, userMessage, passMode, selectedModel);
}

// ---------------------------------------------------------------------------
// Transport: OpenRouter (OpenAI-compatible format)
// ---------------------------------------------------------------------------

interface CallerOpts {
  apiKey: string;
  userMessage: string;
  memeImageUrl: string | null;
  systemPrompt: string;
  selectedModel: string;
  passMode: PassMode;
}

function makeOpenRouterCaller(opts: CallerOpts): (retryMessage?: string) => Promise<string> {
  const messageContent: any[] = [];
  if (opts.memeImageUrl) {
    messageContent.push({
      type: 'image_url',
      image_url: { url: opts.memeImageUrl },
    });
  }
  messageContent.push({ type: 'text', text: opts.userMessage });

  return async (retryMessage?: string) => {
    const content = retryMessage
      ? [{ type: 'text', text: retryMessage }]
      : messageContent;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${opts.apiKey}`,
        'HTTP-Referer': 'https://cuboidstudio.vercel.app',
        'X-Title': 'Cuboid Studio',
      },
      body: JSON.stringify({
        model: opts.selectedModel,
        max_tokens: opts.passMode === 'two_pass' ? MAX_TOKENS_TWO_PASS : MAX_TOKENS_SINGLE,
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    // A response cut off at the token ceiling parses as broken JSON and used
    // to surface as a misleading "malformed_response" — name the real cause.
    if (data.choices?.[0]?.finish_reason === 'length') {
      throw new Error(
        `Model response hit the ${opts.passMode === 'two_pass' ? MAX_TOKENS_TWO_PASS : MAX_TOKENS_SINGLE}-token limit and was cut off — raise the ceiling in api/translate-meme.ts`
      );
    }
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('No text content in OpenRouter response');
    return text;
  };
}

// ---------------------------------------------------------------------------
// Transport: Anthropic native (legacy fallback when OPENROUTER_API_KEY unset)
// ---------------------------------------------------------------------------

async function makeAnthropicCaller(opts: CallerOpts): Promise<(retryMessage?: string) => Promise<string>> {
  // Fetch meme image up-front so retries don't re-download. Only https public
  // URLs allowed (SSRF guard).
  let imageBase64: string | null = null;
  let imageMediaType: string = 'image/jpeg';
  if (opts.memeImageUrl && isSafePublicHttpsUrl(opts.memeImageUrl)) {
    try {
      const imgResponse = await fetch(opts.memeImageUrl);
      if (imgResponse.ok) {
        imageMediaType = (imgResponse.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
        const buffer = await imgResponse.arrayBuffer();
        imageBase64 = Buffer.from(buffer).toString('base64');
      }
    } catch (err) {
      console.log('Failed to fetch meme image, proceeding with text only:', err);
    }
  } else if (opts.memeImageUrl) {
    console.warn('Rejected unsafe memeImageUrl (non-https or private host):', opts.memeImageUrl);
  }

  // Resolve model name for Anthropic-native API. Clients send OpenRouter-style
  // IDs like "anthropic/claude-sonnet-4.6" — strip the vendor prefix and turn
  // version dots into dashes (Anthropic spells it "claude-sonnet-4-6"). If the
  // result doesn't look like an Anthropic model, fall back to the default.
  const anthropicDefault = 'claude-sonnet-4-6';
  let anthropicModel = toAnthropicModelId(opts.selectedModel);
  if (!anthropicModel.startsWith('claude-')) {
    console.warn(`Legacy Anthropic path: unrecognized model "${opts.selectedModel}", falling back to ${anthropicDefault}`);
    anthropicModel = anthropicDefault;
  }

  return async (retryMessage?: string) => {
    const messageContent: any[] = [];
    if (imageBase64 && !retryMessage) {
      messageContent.push({
        type: 'image',
        source: { type: 'base64', media_type: imageMediaType, data: imageBase64 },
      });
    }
    messageContent.push({ type: 'text', text: retryMessage || opts.userMessage });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: opts.passMode === 'two_pass' ? MAX_TOKENS_TWO_PASS : MAX_TOKENS_SINGLE,
        system: opts.systemPrompt,
        messages: [{ role: 'user', content: messageContent }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    if (data.stop_reason === 'max_tokens') {
      throw new Error(
        `Model response hit the ${opts.passMode === 'two_pass' ? MAX_TOKENS_TWO_PASS : MAX_TOKENS_SINGLE}-token limit and was cut off — raise the ceiling in api/translate-meme.ts`
      );
    }
    const textBlock = data.content?.find((b: any) => b.type === 'text');
    if (!textBlock?.text) throw new Error('No text content in Claude response');
    return textBlock.text;
  };
}

// ---------------------------------------------------------------------------
// Response validators
// ---------------------------------------------------------------------------

const VALID_OPERATORS_V1 = new Set(['inversion', 'amplification', 'drift', 'reassignment', 'preservation', 'shuffle']);
const VALID_OPERATORS_V2 = new Set([...VALID_OPERATORS_V1, 'consolidation', 'erosion', 'reinforcement']);
// 'plane' stays valid so old saved operator records keep loading, but the
// prompts no longer offer it — thin flat slabs were over-chosen by the model.
const VALID_CUTTER_TYPES = new Set(['box', 'sphere', 'cylinder', 'plane', 'taper']);
const VALID_EDGE_TYPES = new Set(['adjacency', 'access', 'visibility', 'conflict', 'overlap', 'threshold']);

/**
 * Validators return a result instead of writing to the response directly, so
 * the caller can retry the model once on a semantic failure (e.g. an operator
 * value outside the allowed set) before giving up with a 422.
 */
export type ValidationResult =
  | { ok: true; payload: unknown }
  | { ok: false; error: string; raw: unknown };

function invalid(message: string, raw: unknown): ValidationResult {
  return { ok: false, error: message, raw };
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function isNumberTriple(x: unknown): x is [number, number, number] {
  return Array.isArray(x) && x.length === 3 && x.every(isFiniteNumber);
}

function isStringArrayOfValid(x: unknown, allowed: Set<string>): x is string[] {
  return Array.isArray(x) && x.every(v => typeof v === 'string' && allowed.has(v));
}

/** Validates a cutter object. Returns an error message, or null if valid. */
function validateCutter(cutter: any, label: string): string | null {
  if (!cutter || typeof cutter !== 'object') return `${label}: cutter must be an object`;
  if (!VALID_CUTTER_TYPES.has(cutter.type)) return `${label}: cutter.type must be one of ${[...VALID_CUTTER_TYPES].join(', ')}`;
  if (!isNumberTriple(cutter.proportions)) return `${label}: cutter.proportions must be [number, number, number]`;
  if (!isNumberTriple(cutter.position)) return `${label}: cutter.position must be [number, number, number]`;
  if (!isNumberTriple(cutter.rotation)) return `${label}: cutter.rotation must be [number, number, number]`;
  if (!cutter.proportions.every((n: number) => n > 0)) return `${label}: cutter.proportions must be positive`;
  if (!cutter.position.every((n: number) => n >= -1 && n <= 1)) return `${label}: cutter.position values must be in [-1, 1]`;
  return null;
}

export function validateAndReturnSingle(parsed: any): ValidationResult {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return invalid('Response must be a JSON object', parsed);
  }

  if (!VALID_OPERATORS_V2.has(parsed.operator)) {
    return invalid(`Invalid operator: must be one of ${[...VALID_OPERATORS_V2].join(', ')}`, parsed);
  }
  if (!isStringArrayOfValid(parsed.targets, VALID_EDGE_TYPES)) {
    return invalid(`targets must be an array of valid edge types`, parsed);
  }
  if (!isFiniteNumber(parsed.magnitude) || parsed.magnitude < 0 || parsed.magnitude > 1) {
    return invalid('magnitude must be a number in [0, 1]', parsed);
  }
  if (!isFiniteNumber(parsed.decay) || parsed.decay < 0 || parsed.decay > 1) {
    return invalid('decay must be a number in [0, 1]', parsed);
  }
  if (typeof parsed.reasoning !== 'string') {
    return invalid('reasoning must be a string', parsed);
  }
  const cutterErr = validateCutter(parsed.cutter, 'single');
  if (cutterErr) return invalid(cutterErr, parsed);

  return { ok: true, payload: parsed };
}

export function validateAndReturnTwoPass(parsed: any, model: string): ValidationResult {
  // Accept either a JSON array [pass1, pass2] or a top-level object with pass1/pass2
  let pass1: any;
  let pass2: any;

  if (Array.isArray(parsed) && parsed.length >= 2) {
    pass1 = parsed.find((p: any) => p && p.pass === 1);
    pass2 = parsed.find((p: any) => p && p.pass === 2);
  } else if (parsed && typeof parsed === 'object' && parsed.pass1 && parsed.pass2) {
    pass1 = parsed.pass1;
    pass2 = parsed.pass2;
  }

  if (!pass1 || !pass2 || typeof pass1 !== 'object' || typeof pass2 !== 'object') {
    return invalid('Expected two-pass output: JSON array [{ pass: 1, ... }, { pass: 2, ... }]', parsed);
  }

  // --- Pass 1 ---
  if (!Array.isArray(pass1.rhetorical_moves) || !pass1.rhetorical_moves.every((s: any) => typeof s === 'string')) {
    return invalid('Pass 1: rhetorical_moves must be a string array', pass1);
  }
  if (!Array.isArray(pass1.cultural_tensions)) {
    return invalid('Pass 1: cultural_tensions must be an array', pass1);
  }
  for (const t of pass1.cultural_tensions) {
    if (!t || typeof t !== 'object' || typeof t.description !== 'string'
        || !['internal', 'external', 'both'].includes(t.friction_type)) {
      return invalid('Pass 1: each cultural_tension needs description:string + friction_type:"internal"|"external"|"both"', t);
    }
  }
  if (!Array.isArray(pass1.functional_affects) || !pass1.functional_affects.every((s: any) => typeof s === 'string')) {
    return invalid('Pass 1: functional_affects must be a string array', pass1);
  }
  if (typeof pass1.site_resonance !== 'string') {
    return invalid('Pass 1: site_resonance must be a string', pass1);
  }
  if (typeof pass1.meme_summary !== 'string') {
    return invalid('Pass 1: meme_summary must be a string', pass1);
  }

  // --- Pass 2 ---
  if (!VALID_OPERATORS_V2.has(pass2.operator)) {
    return invalid(`Pass 2: operator must be one of ${[...VALID_OPERATORS_V2].join(', ')}`, pass2);
  }
  if (!isStringArrayOfValid(pass2.targets, VALID_EDGE_TYPES)) {
    return invalid('Pass 2: targets must be an array of valid edge types', pass2);
  }
  if (!isFiniteNumber(pass2.magnitude) || pass2.magnitude < 0 || pass2.magnitude > 1) {
    return invalid('Pass 2: magnitude must be a number in [0, 1]', pass2);
  }
  if (!isFiniteNumber(pass2.decay) || pass2.decay < 0 || pass2.decay > 1) {
    return invalid('Pass 2: decay must be a number in [0, 1]', pass2);
  }
  if (typeof pass2.reasoning !== 'string') {
    return invalid('Pass 2: reasoning must be a string', pass2);
  }
  const cutterErr = validateCutter(pass2.cutter, 'Pass 2');
  if (cutterErr) return invalid(cutterErr, pass2);

  // --- Confidence vector ---
  const cv = pass2.confidence_vector;
  const cvKeys = ['rhetorical_clarity', 'site_resonance', 'affective_coherence', 'operational_specificity'];
  if (!cv || typeof cv !== 'object') {
    return invalid('Pass 2: confidence_vector must be an object', pass2);
  }
  for (const k of cvKeys) {
    if (!isFiniteNumber(cv[k]) || cv[k] < 0 || cv[k] > 1) {
      return invalid(`Pass 2: confidence_vector.${k} must be a number in [0, 1]`, cv);
    }
  }

  return { ok: true, payload: { pass1, pass2, model } };
}
