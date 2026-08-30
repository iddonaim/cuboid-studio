/**
 * Cost governance: per-cell token/price estimates, the --dry-run table, and
 * the --budget-cap guard. Estimates only — good enough to size a batch and
 * catch a runaway matrix before any model is called; per-record estimates are
 * written to the envelope as cost_usd_estimate (an ESTIMATE, as named).
 */

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
  cellType: 'a' | 'b' | 'c';
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
