import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

/**
 * Vercel serverless function: POST /api/translate-meme
 *
 * Translates a meme description into spatial operator parameters
 * using the pataphysical translation system prompt via OpenRouter.
 *
 * Supports two modes controlled by TRANSLATION_PASS_MODE env var
 * and per-request override:
 *
 *   "single"   — v1 behavior: single-pass, flat JSON object response.
 *                Uses src/prompts/pataphysical-translation.md
 *
 *   "two_pass" — v2 behavior: two-pass, JSON array [Pass1, Pass2].
 *                Uses src/prompts/pataphysical-translation-v2.md
 *                Supports site_context injection.
 *
 * The system prompt is loaded from disk at runtime — the architect can edit
 * the prompt file to change translation behavior without any code changes.
 */

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4';

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

function getPassMode(requestOverride?: string): PassMode {
  if (requestOverride === 'single' || requestOverride === 'two_pass') {
    return requestOverride;
  }
  const envVal = process.env.TRANSLATION_PASS_MODE;
  if (envVal === 'two_pass') return 'two_pass';
  return 'single'; // default
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
  } = req.body || {};

  if (!memeDescription || typeof memeDescription !== 'string') {
    return res.status(400).json({ error: 'memeDescription is required' });
  }

  // Size caps — protect against runaway token spend on adversarial/accidental
  // large inputs. Values chosen to comfortably cover realistic usage.
  const MAX_MEME_DESCRIPTION = 8_000;       // ~8 KB of prose
  const MAX_LOCATION_TAG = 256;
  const MAX_SITE_CONTEXT_CHARS = 32_000;    // ~32 KB stringified

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

  const engagement = typeof engagementLevel === 'number'
    ? Math.max(0, Math.min(100, engagementLevel))
    : 50;

  const passMode = getPassMode(pass_mode);
  const selectedModel = (typeof model === 'string' && model.trim()) ? model.trim() : DEFAULT_MODEL;

  // Load the appropriate prompt file
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

  // Inject site context into v2 prompt
  if (passMode === 'two_pass' && site_context) {
    const contextStr = typeof site_context === 'string'
      ? site_context
      : JSON.stringify(site_context, null, 2);
    systemPrompt = systemPrompt.replace('{site_context}', contextStr);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    // Fall back to Anthropic key for backwards compat during migration
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return res.status(500).json({ error: 'Neither OPENROUTER_API_KEY nor ANTHROPIC_API_KEY configured' });
    }
    // Use Anthropic API directly (legacy path)
    return handleAnthropicLegacy(req, res, anthropicKey, systemPrompt, {
      memeDescription, locationTag, engagement, memeImageUrl, passMode, selectedModel,
    });
  }

  // Compose the user message
  const userMessage = [
    `Meme description: ${memeDescription}`,
    locationTag ? `Location: ${locationTag}` : 'Location: none specified',
    `Engagement level: ${engagement}/100`,
  ].join('\n');

  // Build message content (OpenAI-compatible format for OpenRouter)
  const messageContent: any[] = [];
  if (memeImageUrl && typeof memeImageUrl === 'string') {
    messageContent.push({
      type: 'image_url',
      image_url: { url: memeImageUrl },
    });
  }
  messageContent.push({
    type: 'text',
    text: userMessage,
  });

  async function callOpenRouter(retryMessage?: string): Promise<string> {
    const content = retryMessage
      ? [{ type: 'text', text: retryMessage }]
      : messageContent;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://cuboidstudio.vercel.app',
        'X-Title': 'Cuboid Studio',
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: passMode === 'two_pass' ? 2000 : 1000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error('No text content in OpenRouter response');
    }

    return text;
  }

  try {
    let rawText = await callOpenRouter();
    rawText = rawText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Retry once with explicit JSON instruction
      console.log('First parse failed, retrying with explicit JSON instruction');
      const retryText = await callOpenRouter(
        userMessage + '\n\nIMPORTANT: Return ONLY valid JSON. No markdown fences, no backticks, no explanation outside the JSON.'
      );
      const cleanedRetry = retryText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

      try {
        parsed = JSON.parse(cleanedRetry);
      } catch {
        return res.status(422).json({
          error: 'malformed_response',
          raw: cleanedRetry.substring(0, 500),
        });
      }
    }

    if (passMode === 'two_pass') {
      return validateAndReturnTwoPass(res, parsed, selectedModel);
    } else {
      return validateAndReturnSingle(res, parsed);
    }
  } catch (error) {
    console.error('Translation error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Translation failed',
    });
  }
}

// ---------------------------------------------------------------------------
// Response validators
// ---------------------------------------------------------------------------

const VALID_OPERATORS_V1 = new Set(['inversion', 'amplification', 'drift', 'reassignment', 'preservation', 'shuffle']);
const VALID_OPERATORS_V2 = new Set([...VALID_OPERATORS_V1, 'consolidation', 'erosion', 'reinforcement']);
const VALID_CUTTER_TYPES = new Set(['box', 'sphere', 'cylinder', 'plane']);
const VALID_EDGE_TYPES = new Set(['adjacency', 'access', 'visibility', 'conflict', 'overlap', 'threshold']);

function fail(res: VercelResponse, message: string, raw: unknown) {
  return res.status(422).json({
    error: message,
    raw: JSON.stringify(raw).substring(0, 500),
  });
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

function validateAndReturnSingle(res: VercelResponse, parsed: any) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fail(res, 'Response must be a JSON object', parsed);
  }

  if (!VALID_OPERATORS_V2.has(parsed.operator)) {
    return fail(res, `Invalid operator: must be one of ${[...VALID_OPERATORS_V2].join(', ')}`, parsed);
  }
  if (!isStringArrayOfValid(parsed.targets, VALID_EDGE_TYPES)) {
    return fail(res, `targets must be an array of valid edge types`, parsed);
  }
  if (!isFiniteNumber(parsed.magnitude) || parsed.magnitude < 0 || parsed.magnitude > 1) {
    return fail(res, 'magnitude must be a number in [0, 1]', parsed);
  }
  if (!isFiniteNumber(parsed.decay) || parsed.decay < 0 || parsed.decay > 1) {
    return fail(res, 'decay must be a number in [0, 1]', parsed);
  }
  if (typeof parsed.reasoning !== 'string') {
    return fail(res, 'reasoning must be a string', parsed);
  }
  const cutterErr = validateCutter(parsed.cutter, 'single');
  if (cutterErr) return fail(res, cutterErr, parsed);

  return res.status(200).json(parsed);
}

function validateAndReturnTwoPass(res: VercelResponse, parsed: any, model: string) {
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
    return fail(res, 'Expected two-pass output: JSON array [{ pass: 1, ... }, { pass: 2, ... }]', parsed);
  }

  // --- Pass 1 ---
  if (!Array.isArray(pass1.rhetorical_moves) || !pass1.rhetorical_moves.every((s: any) => typeof s === 'string')) {
    return fail(res, 'Pass 1: rhetorical_moves must be a string array', pass1);
  }
  if (!Array.isArray(pass1.cultural_tensions)) {
    return fail(res, 'Pass 1: cultural_tensions must be an array', pass1);
  }
  for (const t of pass1.cultural_tensions) {
    if (!t || typeof t !== 'object' || typeof t.description !== 'string'
        || !['internal', 'external', 'both'].includes(t.friction_type)) {
      return fail(res, 'Pass 1: each cultural_tension needs description:string + friction_type:"internal"|"external"|"both"', t);
    }
  }
  if (!Array.isArray(pass1.functional_affects) || !pass1.functional_affects.every((s: any) => typeof s === 'string')) {
    return fail(res, 'Pass 1: functional_affects must be a string array', pass1);
  }
  if (typeof pass1.site_resonance !== 'string') {
    return fail(res, 'Pass 1: site_resonance must be a string', pass1);
  }
  if (typeof pass1.meme_summary !== 'string') {
    return fail(res, 'Pass 1: meme_summary must be a string', pass1);
  }

  // --- Pass 2 ---
  if (!VALID_OPERATORS_V2.has(pass2.operator)) {
    return fail(res, `Pass 2: operator must be one of ${[...VALID_OPERATORS_V2].join(', ')}`, pass2);
  }
  if (!isStringArrayOfValid(pass2.targets, VALID_EDGE_TYPES)) {
    return fail(res, 'Pass 2: targets must be an array of valid edge types', pass2);
  }
  if (!isFiniteNumber(pass2.magnitude) || pass2.magnitude < 0 || pass2.magnitude > 1) {
    return fail(res, 'Pass 2: magnitude must be a number in [0, 1]', pass2);
  }
  if (!isFiniteNumber(pass2.decay) || pass2.decay < 0 || pass2.decay > 1) {
    return fail(res, 'Pass 2: decay must be a number in [0, 1]', pass2);
  }
  if (typeof pass2.reasoning !== 'string') {
    return fail(res, 'Pass 2: reasoning must be a string', pass2);
  }
  const cutterErr = validateCutter(pass2.cutter, 'Pass 2');
  if (cutterErr) return fail(res, cutterErr, pass2);

  // --- Confidence vector ---
  const cv = pass2.confidence_vector;
  const cvKeys = ['rhetorical_clarity', 'site_resonance', 'affective_coherence', 'operational_specificity'];
  if (!cv || typeof cv !== 'object') {
    return fail(res, 'Pass 2: confidence_vector must be an object', pass2);
  }
  for (const k of cvKeys) {
    if (!isFiniteNumber(cv[k]) || cv[k] < 0 || cv[k] > 1) {
      return fail(res, `Pass 2: confidence_vector.${k} must be a number in [0, 1]`, cv);
    }
  }

  return res.status(200).json({
    pass1,
    pass2,
    model,
  });
}

// ---------------------------------------------------------------------------
// Legacy Anthropic fallback (used when OPENROUTER_API_KEY is not set)
// ---------------------------------------------------------------------------

async function handleAnthropicLegacy(
  req: VercelRequest,
  res: VercelResponse,
  apiKey: string,
  systemPrompt: string,
  opts: {
    memeDescription: string;
    locationTag: string | null;
    engagement: number;
    memeImageUrl: string | null;
    passMode: PassMode;
    selectedModel: string;
  },
) {
  const userMessage = [
    `Meme description: ${opts.memeDescription}`,
    opts.locationTag ? `Location: ${opts.locationTag}` : 'Location: none specified',
    `Engagement level: ${opts.engagement}/100`,
  ].join('\n');

  // Fetch meme image for Anthropic vision format.
  // Only allow public https URLs — reject private/loopback hosts to prevent
  // SSRF (server-side request forgery) against cloud metadata endpoints etc.
  let imageBase64: string | null = null;
  let imageMediaType: string = 'image/jpeg';
  if (opts.memeImageUrl && typeof opts.memeImageUrl === 'string' && isSafePublicHttpsUrl(opts.memeImageUrl)) {
    try {
      const imgResponse = await fetch(opts.memeImageUrl);
      if (imgResponse.ok) {
        const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
        imageMediaType = contentType.split(';')[0].trim();
        const buffer = await imgResponse.arrayBuffer();
        imageBase64 = Buffer.from(buffer).toString('base64');
      }
    } catch (err) {
      console.log('Failed to fetch meme image, proceeding with text only:', err);
    }
  } else if (opts.memeImageUrl) {
    console.warn('Rejected unsafe memeImageUrl (non-https or private host):', opts.memeImageUrl);
  }

  async function callClaude(retryMessage?: string): Promise<string> {
    const messageContent: any[] = [];
    if (imageBase64 && !retryMessage) {
      messageContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMediaType,
          data: imageBase64,
        },
      });
    }
    messageContent.push({
      type: 'text',
      text: retryMessage || userMessage,
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: opts.passMode === 'two_pass' ? 2000 : 1000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: messageContent,
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find((b: any) => b.type === 'text');
    if (!textBlock?.text) {
      throw new Error('No text content in Claude response');
    }

    return textBlock.text;
  }

  try {
    let rawText = await callClaude();
    rawText = rawText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.log('First parse failed, retrying with explicit JSON instruction');
      const retryText = await callClaude(
        userMessage + '\n\nIMPORTANT: Return ONLY valid JSON. No markdown fences, no backticks, no explanation outside the JSON object.'
      );
      const cleanedRetry = retryText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

      try {
        parsed = JSON.parse(cleanedRetry);
      } catch {
        return res.status(422).json({
          error: 'malformed_response',
          raw: cleanedRetry.substring(0, 500),
        });
      }
    }

    if (opts.passMode === 'two_pass') {
      return validateAndReturnTwoPass(res, parsed, opts.selectedModel);
    } else {
      return validateAndReturnSingle(res, parsed);
    }
  } catch (error) {
    console.error('Translation error (Anthropic legacy):', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Translation failed',
    });
  }
}
