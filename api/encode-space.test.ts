import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Transport-selection tests for the encode endpoint. The handler reads
 * ENCODE_MODEL at import time, so each test that varies it re-imports the
 * module with vi.resetModules(). Upstream HTTP is mocked at global fetch —
 * these tests assert which gateway is called and with what model/payload
 * shape, not what the model answers.
 */

const ENV_KEYS = ['OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'ENCODE_MODEL'] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

/** A minimal valid model answer — one cube, no reading. */
const MODEL_ANSWER = JSON.stringify({
  reasoning: 'a single anchoring cube',
  cubes: [{ variationId: 'v-00', position: [0, 0, 0], rotation: { x: 0, y: 0 } }],
});

function mockFetchCapture(answerText: string = MODEL_ANSWER) {
  const calls: { url: string; body: any }[] = [];
  const fetchMock = vi.fn(async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    const isOpenRouter = url.includes('openrouter.ai');
    return {
      ok: true,
      json: async () =>
        isOpenRouter
          ? { choices: [{ message: { content: answerText }, finish_reason: 'stop' }] }
          : { content: [{ type: 'text', text: answerText }] },
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function makeReq(body: Record<string, unknown> = {}): VercelRequest {
  return {
    method: 'POST',
    body: { imageBase64: 'aGVsbG8=', imageMediaType: 'image/jpeg', ...body },
  } as unknown as VercelRequest;
}

function makeRes() {
  const out: { status?: number; json?: any } = {};
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(payload: any) {
      out.json = payload;
      return res;
    },
  } as unknown as VercelResponse;
  return { res, out };
}

async function importHandler() {
  const mod = await import('./encode-space');
  return mod.default;
}

describe('encode-space transport selection', () => {
  it('routes a normal encode through OpenRouter when the key is set', async () => {
    process.env.OPENROUTER_API_KEY = 'or-key';
    const calls = mockFetchCapture();
    const handler = await importHandler();
    const { res, out } = makeRes();

    await handler(makeReq(), res);

    expect(out.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('openrouter.ai');
    expect(calls[0].body.model).toBe('anthropic/claude-sonnet-4.6');
    expect(out.json.model).toBe('anthropic/claude-sonnet-4.6');
    expect(out.json.provider).toBe('openrouter');
  });

  it('sends images to OpenRouter as data-URI image_url blocks', async () => {
    process.env.OPENROUTER_API_KEY = 'or-key';
    const calls = mockFetchCapture();
    const handler = await importHandler();
    const { res } = makeRes();

    await handler(makeReq(), res);

    const content = calls[0].body.messages.find((m: any) => m.role === 'user').content;
    const imageBlock = content.find((c: any) => c.type === 'image_url');
    expect(imageBlock.image_url.url).toBe('data:image/jpeg;base64,aGVsbG8=');
  });

  it('falls back to Anthropic-native when only ANTHROPIC_API_KEY is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'an-key';
    const calls = mockFetchCapture();
    const handler = await importHandler();
    const { res, out } = makeRes();

    await handler(makeReq(), res);

    expect(out.status).toBe(200);
    expect(calls[0].url).toContain('api.anthropic.com');
    expect(calls[0].body.model).toBe('claude-sonnet-4-6');
    expect(out.json.provider).toBe('anthropic');
  });

  it('500s with a both-keys message when neither key is configured', async () => {
    mockFetchCapture();
    const handler = await importHandler();
    const { res, out } = makeRes();

    await handler(makeReq(), res);

    expect(out.status).toBe(500);
    expect(out.json.error).toContain('OPENROUTER_API_KEY');
    expect(out.json.error).toContain('ANTHROPIC_API_KEY');
  });

  it('a request that names a model (Model lab) rides OpenRouter with that id', async () => {
    process.env.OPENROUTER_API_KEY = 'or-key';
    const calls = mockFetchCapture();
    const handler = await importHandler();
    const { res, out } = makeRes();

    await handler(makeReq({ model: 'google/gemini-3.5-flash' }), res);

    expect(calls[0].url).toContain('openrouter.ai');
    expect(calls[0].body.model).toBe('google/gemini-3.5-flash');
    expect(out.json.provider).toBe('openrouter');
  });

  it('a named Claude model still works on the Anthropic fallback', async () => {
    process.env.ANTHROPIC_API_KEY = 'an-key';
    const calls = mockFetchCapture();
    const handler = await importHandler();
    const { res, out } = makeRes();

    await handler(makeReq({ model: 'anthropic/claude-opus-4.8' }), res);

    expect(calls[0].url).toContain('api.anthropic.com');
    expect(calls[0].body.model).toBe('claude-opus-4-8');
    expect(out.json.provider).toBe('anthropic');
  });

  it('accepts an Anthropic-spelled ENCODE_MODEL and converts it for OpenRouter', async () => {
    process.env.OPENROUTER_API_KEY = 'or-key';
    process.env.ENCODE_MODEL = 'claude-sonnet-4-6';
    const calls = mockFetchCapture();
    const handler = await importHandler();
    const { res, out } = makeRes();

    await handler(makeReq(), res);

    expect(calls[0].body.model).toBe('anthropic/claude-sonnet-4.6');
    expect(out.json.provider).toBe('openrouter');
  });

  it('accepts an OpenRouter-spelled ENCODE_MODEL on the Anthropic fallback', async () => {
    process.env.ANTHROPIC_API_KEY = 'an-key';
    process.env.ENCODE_MODEL = 'anthropic/claude-sonnet-4.6';
    const calls = mockFetchCapture();
    const handler = await importHandler();
    const { res, out } = makeRes();

    await handler(makeReq(), res);

    expect(calls[0].body.model).toBe('claude-sonnet-4-6');
    expect(out.json.provider).toBe('anthropic');
  });
});
