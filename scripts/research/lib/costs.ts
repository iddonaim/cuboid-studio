/**
 * Cost governance: per-cell token/price estimates, the --dry-run table, and
 * the --budget-cap guard. Estimates only — good enough to size a batch and
 * catch a runaway matrix before any model is called; per-record estimates are
 * written to the envelope as cost_usd_estimate (an ESTIMATE, as named).
 */

import type { CacheTtl } from './anthropicBatch';
import type { MatrixCell } from './matrix';

export interface ModelPricing {
  usd_per_mtok_in: number;
  usd_per_mtok_out: number;
}

/**
 * USD per million tokens. Snapshot 2026-08 (Anthropic list prices; OpenRouter
 * passes vendor pricing through). Edit here when prices move — the dry-run
 * table prints which entry it used, and unknown models fall back to the
 * default with a visible note.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'anthropic/claude-sonnet-4.6': { usd_per_mtok_in: 3, usd_per_mtok_out: 15 },
  'claude-sonnet-4-6': { usd_per_mtok_in: 3, usd_per_mtok_out: 15 },
  'anthropic/claude-sonnet-5': { usd_per_mtok_in: 3, usd_per_mtok_out: 15 },
  'anthropic/claude-opus-4.8': { usd_per_mtok_in: 15, usd_per_mtok_out: 75 },
  'anthropic/claude-haiku-4.5': { usd_per_mtok_in: 1, usd_per_mtok_out: 5 },
};

export const DEFAULT_PRICING: ModelPricing = { usd_per_mtok_in: 3, usd_per_mtok_out: 15 };

export function pricingFor(modelId: string): { pricing: ModelPricing; known: boolean } {
  const pricing = MODEL_PRICING[modelId];
  return pricing ? { pricing, known: true } : { pricing: DEFAULT_PRICING, known: false };
}

/** chars/4 is the standing rough tokenizer estimate. */
export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / 4);
}

/** Vision block for a meme image — flat estimate (actual depends on
 *  dimensions; ~1.15 Mpx ≈ 1500 tokens on Anthropic's accounting). */
export const IMAGE_TOKENS_ESTIMATE = 1500;

/** Observed ballpark for a full two-pass answer; pass-2-only continuations
 *  (cell c) generate roughly half. */
export const OUTPUT_TOKENS_TWO_PASS = 1200;
export const OUTPUT_TOKENS_PASS2_ONLY = 650;

export interface CellCostEstimate {
  tokens_in: number;
  tokens_out: number;
  usd: number;
  pricing_known: boolean;
}

export function estimateCellCost(cell: {
  modelId: string;
  systemPromptChars: number;
  userMessageChars: number;
  hasImage: boolean;
  cellType: 'a' | 'c';
  prefillChars?: number;
}): CellCostEstimate {
  const { pricing, known } = pricingFor(cell.modelId);
  const tokensIn =
    estimateTokensFromChars(cell.systemPromptChars) +
    estimateTokensFromChars(cell.userMessageChars) +
    (cell.hasImage ? IMAGE_TOKENS_ESTIMATE : 0) +
    (cell.cellType === 'c' ? estimateTokensFromChars(cell.prefillChars ?? 2000) : 0);
  const tokensOut = cell.cellType === 'c' ? OUTPUT_TOKENS_PASS2_ONLY : OUTPUT_TOKENS_TWO_PASS;
  const usd =
    (tokensIn / 1_000_000) * pricing.usd_per_mtok_in +
    (tokensOut / 1_000_000) * pricing.usd_per_mtok_out;
  return { tokens_in: tokensIn, tokens_out: tokensOut, usd, pricing_known: known };
}

// ---------------------------------------------------------------------------
// Batch-route pricing (--transport batch): Message Batches discount + prompt
// caching on the shared system prompt. Multipliers from the official pricing
// and batch docs as of 2026-09-04: the batch discount is 50% off input AND
// output, cache writes cost 1.25× (5m TTL) or 2× (1h TTL) base input, cache
// reads 0.1×, and these multipliers STACK multiplicatively with the batch
// discount (stated explicitly on the pricing page). Base per-model prices
// stay in MODEL_PRICING above (snapshot 2026-08) — edit there when list
// prices move; the multipliers here move only if Anthropic changes the
// discount structure itself.
// ---------------------------------------------------------------------------

export const BATCH_DISCOUNT_MULTIPLIER = 0.5;
export const CACHE_WRITE_MULTIPLIER: Record<CacheTtl, number> = { '5m': 1.25, '1h': 2 };
export const CACHE_READ_MULTIPLIER = 0.1;
/** Sonnet-class minimum cacheable prefix. Below it caching silently no-ops
 *  (no error, no premium billed) — so a too-short system prompt is priced
 *  as plain batch-discounted input, with a visible note. */
export const MIN_CACHEABLE_TOKENS = 1024;

export interface BatchRouteEstimate {
  /** System-prompt share of the input (the cacheable prefix). */
  tokens_system: number;
  tokens_in: number;
  tokens_out: number;
  usd_sync: number;
  /** Upper bound: every call misses and writes the cache (or, below the
   *  cache minimum, plain 50%-discounted input). Budget gating uses this. */
  usd_batch_worst: number;
  /** Marginal lower bound: this call reads a warm cache. The one write per
   *  model is added at the round level (batchRouteTotals). */
  usd_batch_best_marginal: number;
  cacheable: boolean;
  pricing_known: boolean;
}

/**
 * Prices ONE model call on the batch route, from the same inputs
 * estimateCellCost uses. Cache hits inside a batch are best-effort
 * (concurrent processing), so both bounds are reported; the docs recommend
 * the 1-hour TTL for batches and that is what the transport sends.
 */
export function estimateBatchRoute(cell: {
  modelId: string;
  systemPromptChars: number;
  userMessageChars: number;
  hasImage: boolean;
  cellType: 'a' | 'c';
  prefillChars?: number;
  cacheTtl: CacheTtl;
}): BatchRouteEstimate {
  const sync = estimateCellCost(cell);
  const { pricing } = pricingFor(cell.modelId);
  const tokensSystem = estimateTokensFromChars(cell.systemPromptChars);
  const tokensVariable = sync.tokens_in - tokensSystem;
  const cacheable = tokensSystem >= MIN_CACHEABLE_TOKENS;

  const inRate = pricing.usd_per_mtok_in / 1_000_000;
  const outRate = pricing.usd_per_mtok_out / 1_000_000;
  const variableAndOutput =
    BATCH_DISCOUNT_MULTIPLIER * (tokensVariable * inRate + sync.tokens_out * outRate);

  let worst: number;
  let bestMarginal: number;
  if (cacheable) {
    worst = BATCH_DISCOUNT_MULTIPLIER * CACHE_WRITE_MULTIPLIER[cell.cacheTtl] * tokensSystem * inRate + variableAndOutput;
    bestMarginal = BATCH_DISCOUNT_MULTIPLIER * CACHE_READ_MULTIPLIER * tokensSystem * inRate + variableAndOutput;
  } else {
    const flat = BATCH_DISCOUNT_MULTIPLIER * tokensSystem * inRate + variableAndOutput;
    worst = flat;
    bestMarginal = flat;
  }

  return {
    tokens_system: tokensSystem,
    tokens_in: sync.tokens_in,
    tokens_out: sync.tokens_out,
    usd_sync: sync.usd,
    usd_batch_worst: worst,
    usd_batch_best_marginal: bestMarginal,
    cacheable,
    pricing_known: sync.pricing_known,
  };
}

export interface BatchRouteTotals {
  usd_sync: number;
  usd_batch_worst: number;
  /** One cache write per distinct model, every other call a cache read. */
  usd_batch_best: number;
  call_count: number;
  any_uncacheable: boolean;
  pricing_known: boolean;
}

/** Aggregates PER-CALL batch estimates (an E3 step contributes one row per
 *  candidate call, not one per step — the write-once-per-model correction
 *  is per call). */
export function batchRouteTotals(rows: Array<{ modelId: string; est: BatchRouteEstimate }>): BatchRouteTotals {
  let sync = 0;
  let worst = 0;
  let best = 0;
  let anyUncacheable = false;
  let known = true;
  const writeAdded = new Set<string>();
  for (const { modelId, est } of rows) {
    sync += est.usd_sync;
    worst += est.usd_batch_worst;
    anyUncacheable = anyUncacheable || !est.cacheable;
    known = known && est.pricing_known;
    if (est.cacheable && !writeAdded.has(modelId)) {
      // The model's first processed call writes the cache at write price.
      writeAdded.add(modelId);
      best += est.usd_batch_worst;
    } else {
      best += est.usd_batch_best_marginal;
    }
  }
  return {
    usd_sync: sync,
    usd_batch_worst: worst,
    usd_batch_best: best,
    call_count: rows.length,
    any_uncacheable: anyUncacheable,
    pricing_known: known,
  };
}

/** The batch-route pricing block printed under the dry-run table (and before
 *  a submit round). Returns lines; run.ts prints them. */
export function renderBatchPricingLines(totals: BatchRouteTotals, cacheTtl: CacheTtl): string[] {
  const lines: string[] = [];
  lines.push('');
  lines.push(
    `transport=batch pricing (Anthropic Message Batches: 50% token discount; prompt caching on the shared system prompt, cache_control ephemeral ttl=${cacheTtl} — write ${CACHE_WRITE_MULTIPLIER[cacheTtl]}×, read ${CACHE_READ_MULTIPLIER}×, both stacked with the discount):`,
  );
  lines.push(
    `  best case  (one cache write per model, later calls hit):  $${totals.usd_batch_best.toFixed(4)}`,
  );
  lines.push(
    `  worst case (no cache hits — hits are best-effort in batches): $${totals.usd_batch_worst.toFixed(4)}   ← budget cap is checked against this`,
  );
  lines.push(`  sync comparison (no batch discount, no caching):           $${totals.usd_sync.toFixed(4)}`);
  if (totals.any_uncacheable) {
    lines.push(
      `  NOTE: the system prompt is under the ~${MIN_CACHEABLE_TOKENS}-token cache minimum — caching would silently no-op; priced without it`,
    );
  }
  if (!totals.pricing_known) {
    lines.push('  NOTE: at least one model had no pricing entry — default pricing used (MODEL_PRICING in scripts/research/lib/costs.ts)');
  }
  return lines;
}

export interface DryRunRow {
  memeId: string;
  model: string;
  cellType: string;
  replicates: number;
  tokens_in: number;
  tokens_out: number;
  usd: number;
}

/** Renders the dry-run table. Returns the lines (run.ts prints them). */
export function renderDryRunTable(
  cells: Array<MatrixCell & { estimate: CellCostEstimate }>,
): { lines: string[]; total_usd: number; cell_count: number } {
  // Group by meme × model × cellType; replicates within a group share an estimate.
  const groups = new Map<string, DryRunRow>();
  let total = 0;
  let unknownPricing = false;

  for (const cell of cells) {
    total += cell.estimate.usd;
    if (!cell.estimate.pricing_known) unknownPricing = true;
    const key = `${cell.memeId}|${cell.model.id}|${cell.cellType}`;
    const row = groups.get(key);
    if (row) {
      row.replicates += 1;
      row.usd += cell.estimate.usd;
    } else {
      groups.set(key, {
        memeId: cell.memeId,
        model: cell.model.id,
        cellType: cell.cellType,
        replicates: 1,
        tokens_in: cell.estimate.tokens_in,
        tokens_out: cell.estimate.tokens_out,
        usd: cell.estimate.usd,
      });
    }
  }

  const pad = (s: string, n: number) => s.padEnd(n);
  const lines: string[] = [];
  lines.push(
    pad('meme', 30) + pad('model', 30) + pad('cell', 6) + pad('N', 4) +
    pad('tok_in/call', 13) + pad('tok_out/call', 14) + 'est. USD',
  );
  lines.push('-'.repeat(105));
  for (const row of groups.values()) {
    lines.push(
      pad(row.memeId.slice(0, 28), 30) +
      pad(row.model.slice(0, 28), 30) +
      pad(row.cellType, 6) +
      pad(String(row.replicates), 4) +
      pad(String(row.tokens_in), 13) +
      pad(String(row.tokens_out), 14) +
      `$${row.usd.toFixed(4)}`,
    );
  }
  lines.push('-'.repeat(105));
  lines.push(`${cells.length} cells, estimated total $${total.toFixed(4)}`);
  if (unknownPricing) {
    lines.push('NOTE: at least one model had no pricing entry — default pricing used; add it to MODEL_PRICING in scripts/research/lib/costs.ts');
  }
  return { lines, total_usd: total, cell_count: cells.length };
}
