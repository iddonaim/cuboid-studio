import { LLMOperatorResult } from '../operators/types';

export interface TranslateMemeRequest {
  memeDescription: string;
  locationTag: string | null;
  engagementLevel: number;
  memeImageUrl?: string | null;
}

export async function translateMeme(req: TranslateMemeRequest): Promise<LLMOperatorResult> {
  const response = await fetch('/api/translate-meme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
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
