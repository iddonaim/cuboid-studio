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

function validateAndReturnSingle(res: VercelResponse, parsed: any) {
  const required = ['operator', 'targets', 'magnitude', 'decay', 'cutter', 'reasoning'];
  for (const field of required) {
    if (!(field in parsed)) {
      return res.status(422).json({
        error: `Missing required field: ${field}`,
        raw: JSON.stringify(parsed).substring(0, 500),
      });
    }
  }

  const cutterRequired = ['type', 'proportions', 'position', 'rotation'];
  for (const field of cutterRequired) {
    if (!(field in parsed.cutter)) {
      return res.status(422).json({
        error: `Missing required cutter field: ${field}`,
        raw: JSON.stringify(parsed).substring(0, 500),
      });
    }
  }

  return res.status(200).json(parsed);
}

function validateAndReturnTwoPass(res: VercelResponse, parsed: any, model: string) {
  // Accept either a JSON array [pass1, pass2] or a top-level object with pass1/pass2
  let pass1: any;
  let pass2: any;

  if (Array.isArray(parsed) && parsed.length >= 2) {
    pass1 = parsed.find((p: any) => p.pass === 1);
    pass2 = parsed.find((p: any) => p.pass === 2);
  } else if (parsed.pass1 && parsed.pass2) {
    pass1 = parsed.pass1;
    pass2 = parsed.pass2;
  }

  if (!pass1 || !pass2) {
    return res.status(422).json({
      error: 'Expected two-pass output: JSON array [{ pass: 1, ... }, { pass: 2, ... }]',
      raw: JSON.stringify(parsed).substring(0, 500),
    });
  }

  // Validate Pass 1
  const p1Required = ['rhetorical_moves', 'cultural_tensions', 'functional_affects', 'site_resonance', 'meme_summary'];
  for (const field of p1Required) {
    if (!(field in pass1)) {
      return res.status(422).json({
        error: `Missing Pass 1 field: ${field}`,
        raw: JSON.stringify(pass1).substring(0, 500),
      });
    }
  }

  // Validate Pass 2
  const p2Required = ['operator', 'targets', 'magnitude', 'decay', 'cutter', 'reasoning', 'confidence_vector'];
  for (const field of p2Required) {
    if (!(field in pass2)) {
      return res.status(422).json({
        error: `Missing Pass 2 field: ${field}`,
        raw: JSON.stringify(pass2).substring(0, 500),
      });
    }
  }

  const cutterRequired = ['type', 'proportions', 'position', 'rotation'];
  for (const field of cutterRequired) {
    if (!(field in pass2.cutter)) {
      return res.status(422).json({
        error: `Missing Pass 2 cutter field: ${field}`,
        raw: JSON.stringify(pass2.cutter).substring(0, 500),
      });
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

  // Fetch meme image for Anthropic vision format
  let imageBase64: string | null = null;
  let imageMediaType: string = 'image/jpeg';
  if (opts.memeImageUrl && typeof opts.memeImageUrl === 'string') {
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
