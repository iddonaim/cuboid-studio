import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

/**
 * Vercel serverless function: POST /api/translate-meme
 *
 * Translates a meme description into spatial operator parameters
 * using Claude's API with the pataphysical translation system prompt.
 *
 * The system prompt is loaded from src/prompts/pataphysical-translation.md
 * at runtime — the architect can edit that file to change translation behavior
 * without any code changes.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { memeDescription, locationTag, engagementLevel } = req.body || {};

  if (!memeDescription || typeof memeDescription !== 'string') {
    return res.status(400).json({ error: 'memeDescription is required' });
  }

  const engagement = typeof engagementLevel === 'number'
    ? Math.max(0, Math.min(100, engagementLevel))
    : 50;

  // Load the architect's curatorial artifact at runtime
  // This file is read fresh on each invocation — no rebuild needed to change behavior
  let systemPrompt: string;
  try {
    const promptPath = path.join(process.cwd(), 'src', 'prompts', 'pataphysical-translation.md');
    systemPrompt = fs.readFileSync(promptPath, 'utf-8');
  } catch (err) {
    console.error('Failed to load system prompt:', err);
    return res.status(500).json({ error: 'Failed to load translation prompt' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  // Compose the user message
  const userMessage = [
    `Meme description: ${memeDescription}`,
    locationTag ? `Location: ${locationTag}` : 'Location: none specified',
    `Engagement level: ${engagement}/100`,
  ].join('\n');

  // Call Claude API
  async function callClaude(retryMessage?: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: retryMessage || userMessage,
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
    // First attempt
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

    // Validate required fields
    const required = ['operator', 'targets', 'magnitude', 'decay', 'cutter', 'reasoning'];
    for (const field of required) {
      if (!(field in parsed)) {
        return res.status(422).json({
          error: `Missing required field: ${field}`,
          raw: JSON.stringify(parsed).substring(0, 500),
        });
      }
    }

    // Validate cutter subfields
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
  } catch (error) {
    console.error('Translation error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Translation failed',
    });
  }
}
