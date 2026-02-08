import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

/**
 * Vercel serverless function: POST /api/encode-space
 *
 * Accepts a base64 image of an inhabited space and translates it
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

  const { imageBase64, imageMediaType } = req.body || {};

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  const mediaType = imageMediaType || 'image/jpeg';

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

  async function callClaude(retryText?: string): Promise<string> {
    const messageContent: any[] = [];

    if (!retryText) {
      messageContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: imageBase64,
        },
      });
    }

    messageContent.push({
      type: 'text',
      text: retryText || 'Translate this space into a cuboid assembly.',
    });

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

    // Strip markdown code fences if present
    rawText = rawText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Retry once with explicit JSON instruction
      console.log('First parse failed, retrying with explicit JSON instruction');
      const retryText = await callClaude(
        'Translate this space into a cuboid assembly.\n\nIMPORTANT: Return ONLY valid JSON. No markdown fences, no backticks, no explanation outside the JSON object.'
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
      .filter((c: any) => {
        if (!c.variationId || typeof c.variationId !== 'string') return false;
        // Validate variation ID format: v-00 through v-69
        const match = c.variationId.match(/^v-(\d+)$/);
        if (!match) return false;
        const num = parseInt(match[1], 10);
        if (num < 0 || num > 69) return false;
        if (!c.position || !Array.isArray(c.position) || c.position.length !== 3) return false;
        return true;
      })
      .map((c: any) => ({
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
