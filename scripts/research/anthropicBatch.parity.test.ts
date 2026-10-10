/**
 * Batch ↔ sync transport parity (the load-bearing property of --transport
 * batch): the request params a batch submission carries and the way a batch
 * result is turned back into text must equal what makeAnthropicCaller
 * (api/translate-meme.ts) puts on and takes off the wire — byte for byte.
 *
 * App code must not change for the batch transport, so the mirror lives in
 * scripts/research/lib/anthropicBatch.ts and THESE tests pin it to the real
 * caller: fetch is patched, the real caller runs, and the captured wire body
 * is compared against the mirror's output. If api/translate-meme.ts ever
 * changes its request shape, response handling, or version header, this
 * suite fails before a divergent batch could be submitted.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { makeAnthropicCaller, MAX_TOKENS_TWO_PASS, type CallerOpts } from '../../api/translate-meme';
import {
  ANTHROPIC_API_VERSION,
  batchCustomId,
  buildAnthropicMessageParams,
  extractBatchResultText,
  fetchImageForBatch,
  withSystemCacheControl,
} from './lib/anthropicBatch';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const IMAGE_URL = 'https://firebasestorage.googleapis.com/v0/b/example/o/parity.png?alt=media';
const IMAGE_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

const okResponse = { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' };

/** Patches fetch: serves the image URL, captures + answers the Messages API
 *  call, and refuses anything else (parity tests must not touch the net). */
function patchFetch(args: { response?: unknown } = {}): { body: () => Record<string, unknown>; headers: () => Record<string, string> } {
  let captured: { body: Record<string, unknown>; headers: Record<string, string> } | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === IMAGE_URL) {
      return new Response(IMAGE_BYTES, { status: 200, headers: { 'content-type': 'image/png; charset=binary' } });
    }
    if (url === 'https://api.anthropic.com/v1/messages') {
      captured = {
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      };
      return new Response(JSON.stringify(args.response ?? okResponse), { status: 200 });
    }
    throw new Error(`unexpected fetch in parity test: ${url}`);
  }) as typeof fetch;
  return {
    body: () => {
      if (!captured) throw new Error('no Messages API call captured');
      return captured.body;
    },
    headers: () => {
      if (!captured) throw new Error('no Messages API call captured');
      return captured.headers;
    },
  };
}

function baseOpts(overrides: Partial<CallerOpts> = {}): CallerOpts {
  return {
    apiKey: 'test-key',
    userMessage: 'Meme description: a toy meme\nLocation: none specified\nEngagement level: 50/100',
    memeImageUrl: null,
    systemPrompt: 'You translate memes.\n' + 'lexicon line\n'.repeat(40),
    selectedModel: 'anthropic/claude-sonnet-4.6',
    passMode: 'two_pass',
    ...overrides,
  };
}

describe('request-body parity with makeAnthropicCaller', () => {
  it('text-only cell: identical wire body', async () => {
    const opts = baseOpts();
    const wire = patchFetch();
    await (await makeAnthropicCaller(opts))();
    expect(buildAnthropicMessageParams(opts, null)).toEqual(wire.body());
  });

  it('image cell: identical wire body including base64 bytes and sniffed media type', async () => {
    const opts = baseOpts({ memeImageUrl: IMAGE_URL });
    const wire = patchFetch();
    await (await makeAnthropicCaller(opts))();
    const image = await fetchImageForBatch(IMAGE_URL);
    expect(image.mediaType).toBe('image/png');
    expect(buildAnthropicMessageParams(opts, image)).toEqual(wire.body());
  });

  it('prefill cell (c): identical trailing assistant message', async () => {
    const opts = baseOpts({ assistantPrefill: '[{"pass":1,"meme_summary":"frozen"},' });
    const wire = patchFetch();
    await (await makeAnthropicCaller(opts))();
    const params = buildAnthropicMessageParams(opts, null);
    expect(params).toEqual(wire.body());
    const messages = params.messages as Array<{ role: string; content: unknown }>;
    expect(messages[messages.length - 1]).toEqual({ role: 'assistant', content: opts.assistantPrefill });
  });

  it('model id normalization matches (anthropic/claude-sonnet-4.6 → claude-sonnet-4-6)', async () => {
    const opts = baseOpts();
    const wire = patchFetch();
    await (await makeAnthropicCaller(opts))();
    expect(wire.body().model).toBe('claude-sonnet-4-6');
    expect(buildAnthropicMessageParams(opts, null).model).toBe('claude-sonnet-4-6');
  });

  it('version header parity: the batch client sends the version the app sends', async () => {
    const wire = patchFetch();
    await (await makeAnthropicCaller(baseOpts()))();
    expect(wire.headers()['anthropic-version']).toBe(ANTHROPIC_API_VERSION);
  });

  it('DIVERGENCE by design: an unnormalizable model id throws instead of the sync caller\'s silent substitution', () => {
    expect(() => buildAnthropicMessageParams(baseOpts({ selectedModel: 'openai/gpt-5' }), null)).toThrow(/refusing to batch/);
  });

  it('DIVERGENCE by design: a failed image download throws instead of degrading to text-only', async () => {
    globalThis.fetch = (async () => new Response('gone', { status: 404 })) as typeof fetch;
    await expect(fetchImageForBatch(IMAGE_URL)).rejects.toThrow(/refusing to build a text-only batch request/);
    await expect(fetchImageForBatch('http://not-https.example/x.png')).rejects.toThrow(/not a safe public https URL/);
  });

  it('only submits two_pass (probes and single-pass are never batched)', () => {
    expect(() => buildAnthropicMessageParams(baseOpts({ passMode: 'single' as CallerOpts['passMode'] }), null)).toThrow(/two_pass/);
  });
});

describe('cache_control wrapper', () => {
  it('adds only billing metadata: unwrap + strip yields the sync body again', () => {
    const params = buildAnthropicMessageParams(baseOpts(), null);
    const wrapped = withSystemCacheControl(params, '1h');
    expect(wrapped.system).toEqual([
      { type: 'text', text: params.system, cache_control: { type: 'ephemeral', ttl: '1h' } },
    ]);
    const [systemBlock] = wrapped.system as Array<{ text: string }>;
    expect({ ...wrapped, system: systemBlock.text }).toEqual(params);
  });
});

describe('response-handling parity with makeAnthropicCaller', () => {
  async function syncOutcome(response: unknown): Promise<{ text?: string; error?: string }> {
    patchFetch({ response });
    try {
      return { text: await (await makeAnthropicCaller(baseOpts()))() };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  function batchOutcome(message: unknown): { text?: string; error?: string } {
    try {
      return { text: extractBatchResultText(message) };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  it('success: same text, including skipping non-text leading blocks', async () => {
    const message = { content: [{ type: 'tool_use', id: 'x' }, { type: 'text', text: 'the answer' }], stop_reason: 'end_turn' };
    expect(await syncOutcome(message)).toEqual({ text: 'the answer' });
    expect(batchOutcome(message)).toEqual({ text: 'the answer' });
  });

  it('max_tokens cutoff: same thrown message', async () => {
    const message = { content: [{ type: 'text', text: 'trunc' }], stop_reason: 'max_tokens' };
    const sync = await syncOutcome(message);
    expect(sync.error).toContain(`${MAX_TOKENS_TWO_PASS}-token limit`);
    expect(batchOutcome(message)).toEqual(sync);
  });

  it('missing text block: same thrown message', async () => {
    const message = { content: [], stop_reason: 'end_turn' };
    const sync = await syncOutcome(message);
    expect(sync.error).toBe('No text content in Claude response');
    expect(batchOutcome(message)).toEqual(sync);
  });
});

describe('custom_id derivation', () => {
  it('fits the API constraint ^[a-zA-Z0-9_-]{1,64}$ and is deterministic per unit call', async () => {
    const a = await batchCustomId('e2-toy-000__E2__translation__m1__anthropic_claude-sonnet-4-6__cell-a__r0', 'call');
    expect(a).toMatch(/^u[0-9a-f]{40}$/);
    expect(await batchCustomId('e2-toy-000__E2__translation__m1__anthropic_claude-sonnet-4-6__cell-a__r0', 'call')).toBe(a);
    const cand0 = await batchCustomId('step-doc', 'cand0');
    const cand1 = await batchCustomId('step-doc', 'cand1');
    expect(cand0).not.toBe(cand1);
    expect(cand0).not.toBe(a);
  });
});
