import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

type EncodingImage = { base64: string; mediaType: string; isPrimary: boolean };

/**
 * Vercel serverless function: POST /api/encode-space
 *
 * Accepts one or more base64 images of inhabited space and translates them
 * into a cuboid assembly composition using Claude's vision API
 * with the spatial encoding system prompt.
 *
 * The system prompt is loaded from src/prompts/spatial-encoding.md
 * at runtime — the architect can edit that file to change encoding behavior
 * without any code changes.
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

  // Load the architect's curatorial artifact at runtime
  let systemPrompt: string;
  try {
    const promptPath = path.join(process.cwd(), 'src', 'prompts', 'spatial-encoding.md');
    systemPrompt = fs.readFileSync(promptPath, 'utf-8');
  } catch (err) {
    console.error('Failed to load system prompt:', err);
    return res.status(500).json({ error: 'Failed to load encoding prompt' });
  }

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
        model: 'claude-sonnet-4-20250514',
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

  try {
    let rawText = await callClaude(buildContent('Translate this space into a cuboid assembly.'));

    // Strip markdown code fences if present
    rawText = rawText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

    let parsed: { reasoning?: string; cubes?: unknown[] };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Retry once with explicit JSON instruction (images preserved via buildContent)
      console.log('First parse failed, retrying with explicit JSON instruction');
      const retryText = await callClaude(buildContent(
        'Translate this space into a cuboid assembly.\n\nIMPORTANT: Return ONLY valid JSON. No markdown fences, no backticks, no explanation outside the JSON object.'
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

    // Validate required fields
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
      .filter((c: { variationId?: string; position?: number[] }) => {
        if (!c.variationId || typeof c.variationId !== 'string') return false;
        const match = c.variationId.match(/^v-(\d+)$/);
        if (!match) return false;
        const num = parseInt(match[1], 10);
        if (num < 0 || num > 69) return false;
        if (!c.position || !Array.isArray(c.position) || c.position.length !== 3) return false;
        return true;
      })
      .map((c: { variationId: string; position: number[]; rotation?: { x?: number; y?: number } }) => ({
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

    return res.status(200).json({
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
