import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';
import { DEFAULT_LEXICON, type SpatialLexicon } from '../src/prompts/lexicon.default.js';
import { toAnthropicModelId } from '../src/lib/models.js';

// Vision model for encoding, overridable per deployment via ENCODE_MODEL
// (Anthropic or OpenRouter-style id — normalized either way). Model strategy:
// docs/MODEL_STRATEGY.md.
const ENCODE_MODEL = toAnthropicModelId(process.env.ENCODE_MODEL?.trim() || 'claude-sonnet-4-6');

// Response ceiling. Sized for newer-generation models whose tokenizers count
// ~30% more tokens for the same text (observed on the translation path). This
// is an upper bound, not spend — only generated tokens cost anything — so
// raising it from the old 3000 only prevents truncation on large assemblies.
const MAX_TOKENS_ENCODE = 4096;

type EncodingImage = { base64: string; mediaType: string; isPrimary: boolean };

/**
 * Vercel serverless function: POST /api/encode-space
 *
 * Accepts one or more base64 images of inhabited space and translates them
 * into a cuboid assembly composition using Claude's vision API.
 *
 * The system prompt is composed at runtime by filling the grammar template
 * (src/prompts/spatial-encoding-grammar.md) with vocabulary from the active
 * lexicon. The lexicon can be passed in the request body; it falls back to
 * DEFAULT_LEXICON when absent.
 *
 * The model now emits a structured five-axis `reading` before `cubes`. The
 * reading is passed through if present and well-formed; if absent or garbled
 * it is omitted silently. `cubes` remains the only hard requirement — this
 * function never 422s because reading is missing.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let images: EncodingImage[];

  if (req.body.images && Array.isArray(req.body.images)) {
    images = req.body.images.map((img: { base64?: string; mediaType?: string; isPrimary?: boolean }, i: number) => ({
      base64: img.base64,
      mediaType: img.mediaType || 'image/jpeg',
      isPrimary: img.isPrimary ?? i === 0,
    }));
  } else {
    images = [{
      base64: req.body.imageBase64,
      mediaType: req.body.imageMediaType || 'image/jpeg',
      isPrimary: true,
    }];
  }

  if (!images || images.length === 0 || images.some(img => !img.base64)) {
    return res.status(400).json({ error: 'At least one image is required' });
  }
  if (images.length > 7) {
    return res.status(400).json({ error: 'Maximum 7 images per encoding (1 primary + 6 supplementary)' });
  }

  // Load the grammar template at runtime (architect edits this to change behaviour)
  let grammarTemplate: string;
  try {
    const grammarPath = path.join(process.cwd(), 'src', 'prompts', 'spatial-encoding-grammar.md');
    grammarTemplate = fs.readFileSync(grammarPath, 'utf-8');
  } catch (err) {
    console.error('Failed to load grammar template:', err);
    return res.status(500).json({ error: 'Failed to load encoding grammar' });
  }

  // Resolve active lexicon: use request-provided lexicon or fall back to default
  const activeLexicon: SpatialLexicon =
    req.body.lexicon && typeof req.body.lexicon === 'object'
      ? (req.body.lexicon as SpatialLexicon)
      : DEFAULT_LEXICON;

  const systemPrompt = composeSystemPrompt(grammarTemplate, activeLexicon);

  // Per-request model override (OpenRouter-style id, e.g. "google/gemini-3.5-flash"),
  // sent by the encode Model lab. Absent for a normal encode, which keeps the
  // exact Anthropic-direct path below.
  const requestedModel =
    typeof req.body.model === 'string' && req.body.model.trim() ? req.body.model.trim() : null;

  // Compose the final user text, adding the multi-image preamble when needed.
  const composeUserText = (userText: string): string => {
    const primaryIndex = images.findIndex((img) => img.isPrimary);
    return images.length > 1
      ? `You are receiving ${images.length} images. Image ${primaryIndex + 1} is the primary reference — it should anchor the assembly's overall character and scale. The remaining images are supplementary — they contribute specific spatial qualities but should not override the primary's fundamental character.\n\n${userText}`
      : userText;
  };

  // Transport selection. A request that names a model goes through OpenRouter
  // (any vendor) when an OpenRouter key is configured; everything else — every
  // normal encode — takes the unchanged Anthropic-direct path. `modelUsed` is
  // echoed back for provenance.
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  let runModel: (userText: string) => Promise<string>;
  let modelUsed: string;

  if (requestedModel && openRouterKey) {
    modelUsed = requestedModel;
    runModel = makeOpenRouterEncodeCaller(openRouterKey, requestedModel, systemPrompt, images, composeUserText);
  } else {
    if (!anthropicKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }
    // Normal encode uses ENCODE_MODEL; a named Claude model with no OpenRouter
    // key falls back here (non-Claude ids will 400 visibly, per model).
    modelUsed = requestedModel ? toAnthropicModelId(requestedModel) : ENCODE_MODEL;
    runModel = makeAnthropicEncodeCaller(anthropicKey, modelUsed, systemPrompt, images, composeUserText);
  }

  const siteContext = req.body.siteContext;
  let siteContextPrefix = '';
  if (siteContext && typeof siteContext === 'object') {
    const q = siteContext.quantitative;
    const loc = q?.location;
    const sun = q?.sun;
    const pois = siteContext.nearby_pois;
    if (loc?.lat && loc?.lng) {
      const radius = loc.radius_meters || '500';
      const transit = pois?.transit?.length ?? 0;
      const schools = pois?.education?.length ?? 0;
      const civic = pois?.civic?.length ?? 0;
      const parks = pois?.greenSpace?.length ?? 0;
      const roads =
        pois?.majorRoads
          ?.map((r: { name?: string }) => r.name)
          .filter(Boolean)
          .slice(0, 5)
          .join(', ') || 'none listed';
      siteContextPrefix =
        `Site context: ${loc.address || 'Unknown address'}. ${loc.lat}, ${loc.lng}. ` +
        `Sun: ${sun?.primary_exposure || 'n/a'}; summer daylight ${sun?.shadow_hours_summer || 'n/a'}. ` +
        `Nearby: ${transit} transit stops, ${schools} schools, ${civic} civic buildings, ${parks} parks within ${radius}m. ` +
        `Major roads: ${roads}.\n\n`;
    }
  }

  const basePrompt = 'Translate this space into a cuboid assembly.';
  const userPrompt = siteContextPrefix ? `${siteContextPrefix}${basePrompt}` : basePrompt;

  try {
    let rawText = await runModel(userPrompt);

    // Strip markdown code fences if present
    rawText = rawText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

    type RawReading = {
      atmosphere?: { phrase?: string; position?: unknown };
      light?: { phrase?: string; position?: unknown };
      emotion?: { phrase?: string; position?: unknown };
      rhythm?: { phrase?: string; option?: unknown };
      placement?: { phrase?: string; option?: unknown };
    };

    let parsed: {
      reading?: RawReading;
      reasoning?: string;
      cubes?: { variationId?: string; position?: number[]; rotation?: { x?: number; y?: number } }[];
    };

    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Retry once with explicit JSON instruction
      console.log('First parse failed, retrying with explicit JSON instruction');
      const retryText = await runModel(
        `${userPrompt}\n\nIMPORTANT: Return ONLY valid JSON. No markdown fences, no backticks, no explanation outside the JSON object.`
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

    // cubes is the only hard requirement
    if (!parsed.cubes || !Array.isArray(parsed.cubes)) {
      return res.status(422).json({
        error: 'Missing required field: cubes (array)',
        raw: JSON.stringify(parsed).substring(0, 500),
      });
    }

    if (!parsed.reasoning) {
      parsed.reasoning = '';
    }

    // Validate and sanitize each cube
    const validCubes = parsed.cubes
      .filter((c): c is { variationId: string; position: number[]; rotation?: { x?: number; y?: number } } => {
        if (!c.variationId || typeof c.variationId !== 'string') return false;
        const match = c.variationId.match(/^v-(\d+)$/);
        if (!match) return false;
        const num = parseInt(match[1], 10);
        if (num < 0 || num > 69) return false;
        if (!c.position || !Array.isArray(c.position) || c.position.length !== 3) return false;
        return true;
      })
      .map((c) => ({
        variationId: c.variationId,
        position: c.position.map(Number) as [number, number, number],
        rotation: {
          x: Math.max(0, Math.min(3, Math.round(c.rotation?.x ?? 0))),
          y: Math.max(0, Math.min(3, Math.round(c.rotation?.y ?? 0))),
        },
      }));

    if (validCubes.length === 0) {
      return res.status(422).json({
        error: 'No valid cubes in response',
        raw: JSON.stringify(parsed.cubes).substring(0, 500),
      });
    }

    // Passthrough reading if present and well-formed. Never 422 on a bad reading.
    const reading = sanitiseReading(parsed.reading, activeLexicon);

    return res.status(200).json({
      ...(reading ? { reading } : {}),
      reasoning: parsed.reasoning,
      cubes: validCubes,
      // Provenance: which model produced this reading. Additive — existing
      // clients ignore it; future capture can persist it per record.
      model: modelUsed,
    });
  } catch (error) {
    console.error('Encoding error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Encoding failed',
    });
  }
}

// --- Transports ------------------------------------------------------------
//
// Both return a caller `(userText) => Promise<string>` that sends the image(s)
// plus the composed text and returns the raw model output. Unlike the meme
// translation retry (which drops the image), the images ride along on every
// call here — encoding is a vision task, so a retry that couldn't see the
// space would be meaningless.

/** OpenRouter (OpenAI-compatible, multimodal) — used for any named model. */
function makeOpenRouterEncodeCaller(
  apiKey: string,
  model: string,
  systemPrompt: string,
  images: EncodingImage[],
  composeUserText: (userText: string) => string,
): (userText: string) => Promise<string> {
  return async (userText: string) => {
    const content: unknown[] = images.map((img) => ({
      type: 'image_url',
      image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
    }));
    content.push({ type: 'text', text: composeUserText(userText) });

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://cuboidstudio.vercel.app',
        'X-Title': 'Cuboid Studio',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS_ENCODE,
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
    if (data.choices?.[0]?.finish_reason === 'length') {
      throw new Error(
        `Model response hit the ${MAX_TOKENS_ENCODE}-token limit and was cut off — raise MAX_TOKENS_ENCODE in api/encode-space.ts`
      );
    }
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('No text content in OpenRouter response');
    return text;
  };
}

/** Anthropic native — the default encode path and the no-OpenRouter fallback. */
function makeAnthropicEncodeCaller(
  apiKey: string,
  model: string,
  systemPrompt: string,
  images: EncodingImage[],
  composeUserText: (userText: string) => string,
): (userText: string) => Promise<string> {
  return async (userText: string) => {
    const content: unknown[] = images.map((img) => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    }));
    content.push({ type: 'text', text: composeUserText(userText) });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS_ENCODE,
        system: systemPrompt,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    if (data.stop_reason === 'max_tokens') {
      throw new Error(
        `Model response hit the ${MAX_TOKENS_ENCODE}-token limit and was cut off — raise MAX_TOKENS_ENCODE in api/encode-space.ts`
      );
    }
    const textBlock = data.content?.find((b: { type: string }) => b.type === 'text');
    if (!textBlock?.text) {
      throw new Error('No text content in Claude response');
    }
    return textBlock.text;
  };
}

// --- Prompt composition ----------------------------------------------------

function composeSystemPrompt(grammarTemplate: string, lexicon: SpatialLexicon): string {
  const rhythmOptionsList = lexicon.rhythm.options
    .map(o => `- ${o.trigger} → ${o.label}${o.grid_hint ? ` (${o.grid_hint})` : ''}`)
    .join('\n');

  const placementOptionsList = lexicon.placement.options
    .map(o => `- ${o.trigger} → ${o.label}`)
    .join('\n');

  const rhythmOptionIds = lexicon.rhythm.options.map(o => o.id).join(', ');
  const placementOptionIds = lexicon.placement.options.map(o => o.id).join(', ');

  return grammarTemplate
    .replace(/\{\{atmosphere\.pole_low\}\}/g, lexicon.atmosphere.pole_low)
    .replace(/\{\{atmosphere\.pole_mid\}\}/g, lexicon.atmosphere.pole_mid)
    .replace(/\{\{atmosphere\.pole_high\}\}/g, lexicon.atmosphere.pole_high)
    .replace(/\{\{light\.pole_low\}\}/g, lexicon.light.pole_low)
    .replace(/\{\{light\.pole_high\}\}/g, lexicon.light.pole_high)
    .replace(/\{\{light\.triggers\.uniform\}\}/g, lexicon.light.triggers.uniform)
    .replace(/\{\{light\.triggers\.varied\}\}/g, lexicon.light.triggers.varied)
    .replace(/\{\{light\.triggers\.rich\}\}/g, lexicon.light.triggers.rich)
    .replace(/\{\{light\.triggers\.austere\}\}/g, lexicon.light.triggers.austere)
    .replace(/\{\{emotion\.pole_low\}\}/g, lexicon.emotion.pole_low)
    .replace(/\{\{emotion\.pole_high\}\}/g, lexicon.emotion.pole_high)
    .replace(/\{\{emotion\.melancholic\}\}/g, lexicon.emotion.melancholic)
    .replace(/\{\{rhythm\.options_list\}\}/g, rhythmOptionsList)
    .replace(/\{\{placement\.options_list\}\}/g, placementOptionsList)
    .replace(/\{\{rhythm\.option_ids_list\}\}/g, rhythmOptionIds)
    .replace(/\{\{placement\.option_ids_list\}\}/g, placementOptionIds);
}

// --- Reading passthrough / sanitisation ------------------------------------

interface SanitisedAxisContinuous {
  phrase: string;
  position: number;
}

interface SanitisedAxisCategorical {
  phrase: string;
  option: string;
}

interface SanitisedReading {
  atmosphere: SanitisedAxisContinuous;
  light: SanitisedAxisContinuous;
  emotion: SanitisedAxisContinuous;
  rhythm: SanitisedAxisCategorical;
  placement: SanitisedAxisCategorical;
}

/**
 * Validate and sanitise the reading object the model returns.
 * Returns null (silently omit) if the reading is absent or structurally broken.
 * Never throws. Lenient: clamps positions to [0,1], accepts any option string
 * the active lexicon declares (open-list — unknown values pass through).
 */
function sanitiseReading(
  raw: {
    atmosphere?: { phrase?: string; position?: unknown };
    light?: { phrase?: string; position?: unknown };
    emotion?: { phrase?: string; position?: unknown };
    rhythm?: { phrase?: string; option?: unknown };
    placement?: { phrase?: string; option?: unknown };
  } | undefined,
  _lexicon: SpatialLexicon,
): SanitisedReading | null {
  if (!raw || typeof raw !== 'object') return null;

  try {
    const clamp = (v: unknown): number => {
      const n = Number(v);
      if (!isFinite(n)) return 0;
      return Math.max(0, Math.min(1, n));
    };

    const phrase = (v: unknown): string =>
      typeof v === 'string' && v.trim().length > 0 ? v.trim() : '';

    const continuous = (axis: { phrase?: string; position?: unknown } | undefined): SanitisedAxisContinuous | null => {
      if (!axis || typeof axis !== 'object') return null;
      return { phrase: phrase(axis.phrase), position: clamp(axis.position) };
    };

    const categorical = (axis: { phrase?: string; option?: unknown } | undefined): SanitisedAxisCategorical | null => {
      if (!axis || typeof axis !== 'object') return null;
      const opt = typeof axis.option === 'string' ? axis.option.trim() : '';
      if (!opt) return null;
      return { phrase: phrase(axis.phrase), option: opt };
    };

    const atmosphere = continuous(raw.atmosphere);
    const light = continuous(raw.light);
    const emotion = continuous(raw.emotion);
    const rhythm = categorical(raw.rhythm);
    const placement = categorical(raw.placement);

    if (!atmosphere || !light || !emotion || !rhythm || !placement) return null;

    return { atmosphere, light, emotion, rhythm, placement };
  } catch {
    return null;
  }
}
