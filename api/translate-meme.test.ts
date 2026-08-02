import { describe, it, expect, vi } from 'vitest';
import type { VercelResponse } from '@vercel/node';
import { validateAndReturnSingle, validateAndReturnTwoPass, parseAndRoute } from './translate-meme';

// A geometrically valid cutter shared across fixtures.
const validCutter = {
  type: 'plane',
  proportions: [0.8, 0.1, 0.9],
  position: [0.3, 0.5, 0.4],
  rotation: [0, 15, 0],
  geometry_reasoning: 'a thin diagonal plane',
};

const validPass1 = {
  pass: 1,
  rhetorical_moves: ['irony', 'juxtaposition'],
  cultural_tensions: [{ description: 'residents priced out', friction_type: 'external' }],
  functional_affects: ['indignation'],
  site_resonance: 'the meme touches the contested market edge',
  meme_summary: 'an ironic meme about displacement',
};

const validPass2 = {
  pass: 2,
  operator: 'reassignment',
  targets: ['adjacency', 'threshold'],
  target_reasoning: 'the tension acts on who is next to whom',
  magnitude: 0.4,
  decay: 0.2,
  cutter: validCutter,
  confidence_vector: {
    rhetorical_clarity: 0.9,
    site_resonance: 0.7,
    affective_coherence: 0.8,
    operational_specificity: 0.5,
  },
  confidence_note: 'site resonance is the strained axis',
  reasoning: 'displacement maps to a reassignment of adjacency edges',
};

describe('validateAndReturnTwoPass', () => {
  it('accepts a well-formed two-pass response (array form)', () => {
    const result = validateAndReturnTwoPass([validPass1, validPass2], 'test-model');
    expect(result.ok).toBe(true);
  });

  it('accepts the object form { pass1, pass2 }', () => {
    const result = validateAndReturnTwoPass({ pass1: validPass1, pass2: validPass2 }, 'test-model');
    expect(result.ok).toBe(true);
  });

  it('rejects an operator outside the allowed set — the #62 regression', () => {
    // "juxtaposition" is a rhetorical move, not an operator. This is the exact
    // value that produced the original 422 in the field.
    const bad = { ...validPass2, operator: 'juxtaposition' };
    const result = validateAndReturnTwoPass([validPass1, bad], 'test-model');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('operator must be one of');
  });

  it('rejects a target that is not a valid edge type', () => {
    const bad = { ...validPass2, targets: ['adjacency', 'not-an-edge'] };
    const result = validateAndReturnTwoPass([validPass1, bad], 'test-model');
    expect(result.ok).toBe(false);
  });

  it('rejects an out-of-range magnitude', () => {
    const bad = { ...validPass2, magnitude: 1.5 };
    const result = validateAndReturnTwoPass([validPass1, bad], 'test-model');
    expect(result.ok).toBe(false);
  });

  it('rejects a missing confidence vector', () => {
    const bad = { ...validPass2 } as Record<string, unknown>;
    delete bad.confidence_vector;
    const result = validateAndReturnTwoPass([validPass1, bad], 'test-model');
    expect(result.ok).toBe(false);
  });

  it('rejects a cutter with an out-of-bounds position', () => {
    const bad = { ...validPass2, cutter: { ...validCutter, position: [2, 0, 0] } };
    const result = validateAndReturnTwoPass([validPass1, bad], 'test-model');
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed pass 1 (bad friction_type)', () => {
    const badP1 = { ...validPass1, cultural_tensions: [{ description: 'x', friction_type: 'sideways' }] };
    const result = validateAndReturnTwoPass([badP1, validPass2], 'test-model');
    expect(result.ok).toBe(false);
  });
});

const validSingle = {
  operator: 'amplification',
  targets: ['visibility'],
  magnitude: 0.6,
  decay: 0.1,
  reasoning: 'amplify the visible edges',
  cutter: validCutter,
};

describe('validateAndReturnSingle', () => {
  it('accepts a well-formed single-pass response', () => {
    expect(validateAndReturnSingle(validSingle).ok).toBe(true);
  });

  it('rejects an invalid operator', () => {
    expect(validateAndReturnSingle({ ...validSingle, operator: 'juxtaposition' }).ok).toBe(false);
  });

  it('rejects an array (must be a JSON object)', () => {
    expect(validateAndReturnSingle([validSingle]).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseAndRoute — retry orchestration around the model caller. No real
// network or model calls: `caller` is a hand-rolled stub per test, and `res`
// is a minimal Vercel-response double that just records status/json calls.

function fakeRes() {
  const res = {} as VercelResponse;
  res.status = vi.fn().mockReturnValue(res) as unknown as VercelResponse['status'];
  res.json = vi.fn().mockReturnValue(res) as unknown as VercelResponse['json'];
  return res;
}

describe('parseAndRoute', () => {
  it('returns 200 with the validated payload on a clean first response', async () => {
    const caller = vi.fn().mockResolvedValue(JSON.stringify(validSingle));
    const res = fakeRes();

    await parseAndRoute(res, caller, 'the user message', 'single', 'test-model');

    expect(caller).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(validSingle);
  });

  it('dispatches to the two-pass validator and wraps the payload with the model name', async () => {
    const caller = vi.fn().mockResolvedValue(JSON.stringify([validPass1, validPass2]));
    const res = fakeRes();

    await parseAndRoute(res, caller, 'the user message', 'two_pass', 'test-model');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ pass1: validPass1, pass2: validPass2, model: 'test-model' });
  });

  it('stamps the serving gateway onto the two-pass payload when provider is given', async () => {
    const caller = vi.fn().mockResolvedValue(JSON.stringify([validPass1, validPass2]));
    const res = fakeRes();

    await parseAndRoute(res, caller, 'the user message', 'two_pass', 'test-model', null, 'openrouter');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      pass1: validPass1,
      pass2: validPass2,
      model: 'test-model',
      provider: 'openrouter',
    });
  });

  it('stamps promptVersion onto the single-pass payload when the prompt file declares one — not coupled to pass mode', async () => {
    const caller = vi.fn().mockResolvedValue(JSON.stringify(validSingle));
    const res = fakeRes();

    await parseAndRoute(res, caller, 'the user message', 'single', 'test-model', '3');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ...validSingle, promptVersion: '3' });
  });

  it('never injects provider into the single-pass payload (it is spread into operator params)', async () => {
    const caller = vi.fn().mockResolvedValue(JSON.stringify(validSingle));
    const res = fakeRes();

    await parseAndRoute(res, caller, 'the user message', 'single', 'test-model', null, 'anthropic');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(validSingle);
  });

  it('retries once with an explicit JSON instruction when the first response is not valid JSON, then succeeds', async () => {
    const caller = vi.fn()
      .mockResolvedValueOnce('sure, here it is: ' + JSON.stringify(validSingle))
      .mockResolvedValueOnce(JSON.stringify(validSingle));
    const res = fakeRes();

    await parseAndRoute(res, caller, 'the user message', 'single', 'test-model');

    expect(caller).toHaveBeenCalledTimes(2);
    expect(caller).toHaveBeenNthCalledWith(1);
    expect(caller).toHaveBeenNthCalledWith(2, expect.stringContaining('Return ONLY valid JSON'));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(validSingle);
  });

  it('returns a 422 malformed_response when both the original and retried response fail to parse as JSON', async () => {
    const caller = vi.fn().mockResolvedValue('not json at all');
    const res = fakeRes();

    await parseAndRoute(res, caller, 'the user message', 'single', 'test-model');

    expect(caller).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'malformed_response' }));
  });

  it('returns a 500 when the caller itself throws (transport failure)', async () => {
    const caller = vi.fn().mockRejectedValue(new Error('OpenRouter API error (503): upstream down'));
    const res = fakeRes();

    await parseAndRoute(res, caller, 'the user message', 'single', 'test-model');

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'OpenRouter API error (503): upstream down' });
  });

  it('re-asks once on a semantically-invalid response, quoting the validation error, then succeeds', async () => {
    const bad = { ...validSingle, operator: 'juxtaposition' };
    const caller = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(bad))
      .mockResolvedValueOnce(JSON.stringify(validSingle));
    const res = fakeRes();

    await parseAndRoute(res, caller, 'the user message', 'single', 'test-model');

    expect(caller).toHaveBeenCalledTimes(2);
    expect(caller).toHaveBeenNthCalledWith(2, expect.stringContaining('Invalid operator'));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(validSingle);
  });

  it('returns 422 with the original validation error when the corrective retry is still semantically invalid', async () => {
    const bad = { ...validSingle, operator: 'juxtaposition' };
    const stillBad = { ...validSingle, operator: 'some-other-bad-op' };
    const caller = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(bad))
      .mockResolvedValueOnce(JSON.stringify(stillBad));
    const res = fakeRes();

    await parseAndRoute(res, caller, 'the user message', 'single', 'test-model');

    expect(caller).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(422);
    // The error quoted back is the *original* failure (on `bad`), not the retry's.
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('Invalid operator'),
    }));
  });

  it('keeps the original validation error when the corrective retry response fails to parse as JSON at all', async () => {
    const bad = { ...validSingle, operator: 'juxtaposition' };
    const caller = vi.fn()
      .mockResolvedValueOnce(JSON.stringify(bad))
      .mockResolvedValueOnce('not json either');
    const res = fakeRes();

    await parseAndRoute(res, caller, 'the user message', 'single', 'test-model');

    expect(caller).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('Invalid operator'),
    }));
  });
});
