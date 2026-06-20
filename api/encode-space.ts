import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';
import { DEFAULT_LEXICON, type SpatialLexicon } from '../src/prompts/lexicon.default.js';

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  function buildContent(userText: string): { type: string; text?: string; source?: { type: string; media_type: string; data: string } }[] {
    const content: { type: string; text?: string; source?: { type: string; media_type: string; data: string } }[] = [];

    images.forEach((img) => {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
      });
    });

    const primaryIndex = images.findIndex(img => img.isPrimary);
    const imageContext = images.length > 1
      ? `You are receiving ${images.length} images. Image ${primaryIndex + 1} is the primary reference — it should anchor the assembly's overall character and scale. The remaining images are supplementary — they contribute specific spatial qualities but should not override the primary's fundamental character.\n\n${userText}`
      : userText;

    content.push({ type: 'text', text: imageContext });
    return content;
  }

  async function callClaude(content: { type: string; text?: string; source?: { type: string; media_type: string; data: string } }[]): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content,
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find((b: { type: string }) => b.type === 'text');
    if (!textBlock?.text) {
      throw new Error('No text content in Claude response');
    }

    return textBlock.text;
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
    let rawText = await callClaude(buildContent(userPrompt));

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
      const retryText = await callClaude(buildContent(
        `${userPrompt}\n\nIMPORTANT: Return ONLY valid JSON. No markdown fences, no backticks, no explanation outside the JSON object.`
      ));
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
    });
  } catch (error) {
    console.error('Encoding error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Encoding failed',
    });
  }
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
