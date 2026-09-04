/**
 * Anthropic Message Batches API layer (transport `batch`, 2026-09-04).
 *
 * The sync path sends each cell through makeAnthropicCaller
 * (api/translate-meme.ts). A batch submission must put the SAME request on
 * the wire, but the request body is assembled inside that caller's closure —
 * unreachable without a network call — and app code must not change. So this
 * module MIRRORS the closure's body construction and response handling, and
 * scripts/research/anthropicBatch.parity.test.ts pins the mirror to the real
 * caller byte-for-byte (it patches fetch, runs makeAnthropicCaller, and
 * compares the captured wire body against buildAnthropicMessageParams). If
 * the app transport ever changes shape, the parity test fails before any
 * batch could submit a divergent request.
 *
 * The one deliberate addition on the batch route: a `cache_control`
 * breakpoint on the system prompt (identical text — cache_control is billing
 * metadata, not prompt content). All cells in a batch share one composed
 * system prompt, so per model the first processed request writes the cache
 * and the rest can read it. Docs recommend the 1-hour TTL for batches
 * (5-minute entries can expire mid-batch); both the TTL and the resulting
 * prices are declared in the dry-run table and the submission doc.
 * API + pricing facts from the official docs as of 2026-09-04
 * (platform.claude.com/docs: batch-processing, prompt-caching, pricing):
 * batches are GA (no beta header), custom_id must match ^[a-zA-Z0-9_-]{1,64}$,
 * results are JSONL with per-request succeeded/errored/canceled/expired
 * (only succeeded/… processed requests bill; errored/canceled/expired do
 * not), and the 50% batch discount stacks multiplicatively with the cache
 * write/read multipliers.
 *
 * One deliberate divergence from the sync caller: makeAnthropicCaller
 * silently proceeds TEXT-ONLY when a meme image fails to download (app-side
 * resilience). For a research batch that would submit a different experiment
 * than declared, so fetchImageForBatch THROWS instead — the same reasoning
 * as run.ts's image pre-flight.
 */

import { MAX_TOKENS_TWO_PASS, isSafePublicHttpsUrl, type CallerOpts } from '../../../api/translate-meme.js';
import { toAnthropicModelId } from '../../../src/lib/models.js';
import { sha256HexOfCanonicalJson, sha256HexOfString } from '../../../src/research/hashing.js';

// ---------------------------------------------------------------------------
// Request construction (mirror of makeAnthropicCaller's initial call)
// ---------------------------------------------------------------------------

export interface FetchedImage {
  base64: string;
  mediaType: string;
}

/** In-process image cache so one meme's image is downloaded once per run,
 *  not once per cell × phase. Keyed by URL. */
export type ImageCache = Map<string, FetchedImage>;

/**
 * Downloads a meme image exactly the way makeAnthropicCaller does
 * (content-type sniff with image/jpeg default, base64 body) but REFUSES on
 * an unsafe URL or a failed fetch instead of degrading to text-only.
 */
export async function fetchImageForBatch(url: string, cache?: ImageCache): Promise<FetchedImage> {
  const cached = cache?.get(url);
  if (cached) return cached;
  if (!isSafePublicHttpsUrl(url)) {
    throw new Error(`meme image URL is not a safe public https URL (${url}) — refusing to build a text-only batch request`);
  }
  const response = await fetch(url).catch((err: unknown) => {
    throw new Error(`meme image fetch failed (${url}): ${err instanceof Error ? err.message : String(err)}`);
  });
  if (!response.ok) {
    throw new Error(`meme image fetch failed (${url}): HTTP ${response.status} — refusing to build a text-only batch request`);
  }
  const mediaType = (response.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  const buffer = await response.arrayBuffer();
  const image = { base64: Buffer.from(buffer).toString('base64'), mediaType };
  cache?.set(url, image);
  return image;
}

/**
 * The exact /v1/messages request body makeAnthropicCaller sends for the
 * INITIAL call (retryMessage undefined) — retries are never batched; they
 * run sync at collect time through the real caller. Parity-tested.
 */
export function buildAnthropicMessageParams(
  opts: CallerOpts,
  image: FetchedImage | null,
): Record<string, unknown> {
  if (opts.passMode !== 'two_pass') {
    throw new Error('batch transport only submits two_pass requests (probes and single-pass calls are never batched)');
  }
  const model = toAnthropicModelId(opts.selectedModel);
  if (!model.startsWith('claude-')) {
    // Same refusal as assertAnthropicModelId: the sync caller would silently
    // substitute its default model here — never acceptable for a record.
    throw new Error(`model ${opts.selectedModel} does not normalize to a claude-* id — refusing to batch it`);
  }
  const messageContent: unknown[] = [];
  if (image) {
    messageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
    });
  }
  messageContent.push({ type: 'text', text: opts.userMessage });
  return {
    model,
    max_tokens: MAX_TOKENS_TWO_PASS,
    system: opts.systemPrompt,
    messages: [
      { role: 'user', content: messageContent },
      ...(opts.assistantPrefill ? [{ role: 'assistant', content: opts.assistantPrefill }] : []),
    ],
  };
}

export type CacheTtl = '5m' | '1h';

/**
 * Adds the batch route's one addition: `cache_control` on the system prompt.
 * The system string becomes the equivalent single text block (same text) so
 * the breakpoint has somewhere to sit. Content is unchanged — stripping
 * cache_control and unwrapping the block yields the sync body again (the
 * parity test asserts exactly that).
 */
export function withSystemCacheControl(
  params: Record<string, unknown>,
  ttl: CacheTtl,
): Record<string, unknown> {
  if (typeof params.system !== 'string') {
    throw new Error('withSystemCacheControl expects the sync-parity string form of system');
  }
  return {
    ...params,
    system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral', ttl } }],
  };
}

/** Identity of the exact submitted request body, for the submission doc.
 *  Collect rebuilds the params from the same inputs and refuses to attach a
 *  result whose request it cannot reproduce hash-for-hash. */
export async function hashMessageParams(params: Record<string, unknown>): Promise<string> {
  return sha256HexOfCanonicalJson(params);
}

// ---------------------------------------------------------------------------
// Response handling (mirror of makeAnthropicCaller's response path)
// ---------------------------------------------------------------------------

/**
 * Turns a batch result's Message object into the string the sync caller
 * would have returned for the same response — including the same thrown
 * errors for a max_tokens cutoff and for a missing text block, so the
 * recording caller and parseAndRoute see byte-identical behavior.
 */
export function extractBatchResultText(message: unknown): string {
  const data = (message ?? {}) as { stop_reason?: string; content?: Array<{ type?: string; text?: string }> };
  if (data.stop_reason === 'max_tokens') {
    throw new Error(
      `Model response hit the ${MAX_TOKENS_TWO_PASS}-token limit and was cut off — raise the ceiling in api/translate-meme.ts`,
    );
  }
  const textBlock = data.content?.find((b) => b.type === 'text');
  if (!textBlock?.text) throw new Error('No text content in Claude response');
  return textBlock.text;
}

// ---------------------------------------------------------------------------
// Batch REST client (GA endpoints; anthropic-version matches the app's)
// ---------------------------------------------------------------------------

const BATCHES_URL = 'https://api.anthropic.com/v1/messages/batches';

/** Same version header the app's sync caller sends — the parity test pins
 *  both to the wire, so an app-side bump fails tests here too. */
export const ANTHROPIC_API_VERSION = '2023-06-01';

function batchHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_API_VERSION,
  };
}

export interface BatchRequestCounts {
  processing: number;
  succeeded: number;
  errored: number;
  canceled: number;
  expired: number;
}

export interface MessageBatchStatus {
  id: string;
  processing_status: 'in_progress' | 'canceling' | 'ended';
  request_counts: BatchRequestCounts;
  created_at?: string;
  ended_at?: string | null;
  results_url?: string | null;
}

export interface BatchResultEntry {
  type: 'succeeded' | 'errored' | 'canceled' | 'expired';
  message?: unknown;
  error?: unknown;
}

async function batchApi(apiKey: string, url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, headers: batchHeaders(apiKey) });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic Batch API error (${response.status}): ${errorText}`);
  }
  return response;
}

export async function createMessageBatch(
  apiKey: string,
  requests: Array<{ custom_id: string; params: Record<string, unknown> }>,
): Promise<MessageBatchStatus> {
  const response = await batchApi(apiKey, BATCHES_URL, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });
  return (await response.json()) as MessageBatchStatus;
}

export async function getMessageBatch(apiKey: string, batchId: string): Promise<MessageBatchStatus> {
  const response = await batchApi(apiKey, `${BATCHES_URL}/${batchId}`);
  return (await response.json()) as MessageBatchStatus;
}

/** Downloads and parses the results JSONL (available once processing_status
 *  is "ended"; retained 29 days). Returns custom_id → result. */
export async function fetchMessageBatchResults(
  apiKey: string,
  batchId: string,
): Promise<Map<string, BatchResultEntry>> {
  const response = await batchApi(apiKey, `${BATCHES_URL}/${batchId}/results`);
  const text = await response.text();
  const results = new Map<string, BatchResultEntry>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const parsed = JSON.parse(line) as { custom_id: string; result: BatchResultEntry };
    if (!parsed.custom_id || !parsed.result?.type) {
      throw new Error(`unexpected batch results line shape: ${line.slice(0, 200)}`);
    }
    results.set(parsed.custom_id, parsed.result);
  }
  return results;
}

// ---------------------------------------------------------------------------
// custom_id ↔ unit identity
// ---------------------------------------------------------------------------

/**
 * custom_id must match ^[a-zA-Z0-9_-]{1,64}$ — our deterministic Firestore
 * doc ids routinely exceed 64 chars, so the custom_id is a hash of the unit
 * key instead: deterministic (recomputable from the config alone — collect
 * needs no stored mapping to survive a lost submission doc) and
 * collision-negligible at 160 bits.
 *
 * Unit key: `<record doc id>::<call key>` — call key "call" for an E2 cell's
 * single request, "cand<i>" for one E3 step candidate.
 */
export async function batchCustomId(docId: string, callKey: string): Promise<string> {
  return 'u' + (await sha256HexOfString(`${docId}::${callKey}`)).slice(0, 40);
}
