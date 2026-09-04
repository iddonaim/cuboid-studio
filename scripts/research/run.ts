/**
 * Phase 0 batch harness — headless CLI (Milestone 2 scaffold).
 *
 *   npm run research:run -- --config scripts/research/examples/e2-toy.batch.json --dry-run
 *   npm run research:run -- --config <batch.json> --execute --operator "<who>" [--budget-cap 25]
 *
 * Transport `batch` (2026-09-04) — same batches through the Anthropic
 * Message Batches API (50% token discount + prompt caching; anthropic-routed
 * models only):
 *
 *   # price the batch as it would actually route (batch + caching), with the
 *   # sync figure kept for comparison:
 *   npm run research:run -- --config <batch.json> --dry-run --transport batch
 *   # submit one round (writes the batch record + an append-only submission
 *   # doc; nothing else is written at submit time):
 *   npm run research:run -- --config <batch.json> --execute --transport batch --operator "<who>"
 *   # collect an ended round into research_records (identical records,
 *   # doc ids, hashes and failure handling as a sync run; re-runnable):
 *   npm run research:run -- --config <batch.json> --collect --operator "<who>"
 *
 * --dry-run prints cell count × estimated tokens × price and exits without
 * calling any model or touching Firestore. --execute runs the matrix:
 * deterministic cell order, resumable by batch_id (cells whose deterministic
 * document id already exists are skipped), budget-capped, every record
 * written through writeResearchRecord. A batch-transport E2 run is typically
 * two rounds (submit/collect for the (a) cells, then again for the (c) cells,
 * whose frozen Pass-1 sources are written by the first collect).
 *
 * Scope: E2 cells (a, c) and E3 step-mode replay (frozen state → N step
 * replicates; wired 2026-08-31 on the R2 refactor). E1 encode cells and E3
 * CAMPAIGN mode remain stubs. Running an actual campaign is a separate,
 * human-initiated step — this CLI existing is not an instruction to run it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { RESEARCH_BATCHES_COLLECTION, RESEARCH_RECORDS_COLLECTION } from '../../src/research/types.js';
import { researchRecordExists, writeResearchRecord } from '../../src/research/writeResearchRecord.js';
import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { batchResumeMismatches, buildBatchRecord, writeBatchRecordOnce, type BatchRecord } from './lib/batchRecord.js';
import { parseBatchConfig, type BatchConfig, type BatchModelConfig } from './lib/config.js';
import { loadCorpusFromFile, loadCorpusFromFirestore, type Corpus } from './lib/corpus.js';
import {
  buildStepTranslationRequests,
  hashEvolveState,
  parseFrozenEvolveState,
} from './lib/evolveState.js';
import {
  estimateStepCost,
  runEvolveStep,
  stepDocId,
  type EvolveStepContext,
} from './lib/evolveStep.js';
import {
  batchRouteTotals,
  estimateBatchRoute,
  estimateCellCost,
  renderBatchPricingLines,
  renderDryRunTable,
  type BatchRouteEstimate,
  type CellCostEstimate,
} from './lib/costs.js';
import type { CacheTtl } from './lib/anthropicBatch.js';
import {
  collectBatchRound,
  makeE2BatchUnit,
  makeE3BatchUnit,
  submitBatchRound,
  type BatchRoundContext,
  type BatchUnit,
} from './lib/batchTransport.js';
import { initHeadlessFirebase } from './lib/headlessFirebase.js';
import { defaultFrozenSourceDocId, expandMatrix, type MatrixCell } from './lib/matrix.js';
import { captureRegime } from './lib/regime.js';
import {
  assembleTwoPassSystemPrompt,
  buildUserMessage,
  extractFrozenSource,
  FrozenSourceUnavailableError,
  needsPrefillProbe,
  probePrefillSupport,
  runTranslationCell,
  type FrozenPass1Source,
  type TranslationCellContext,
} from './lib/translationCell.js';
import { isSafePublicHttpsUrl } from '../../api/translate-meme.js';
import { sha256HexOfString } from '../../src/research/hashing.js';
import { mapMemeToCuboidInput } from '../../src/lib/meme-mapper.js';

const REPO_ROOT = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), '../..');

/** The docs recommend the 1-hour cache TTL inside batches (5-minute entries
 *  can expire before concurrently processed requests reach them). Declared
 *  in the dry-run pricing block and every submission doc. */
const BATCH_CACHE_TTL: CacheTtl = '1h';

type RunMode = 'dry-run' | 'execute' | 'collect';
type Transport = 'sync' | 'batch';

function appCommit(): string {
  if (process.env.APP_COMMIT) return process.env.APP_COMMIT;
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Loads the site context and fixes its identity as the EXACT string the
 * prompt will carry (the handler's injection format). Hashing that string —
 * rather than a canonicalized object — means two runs share a
 * site_context_hash iff their prompts carried the same bytes.
 */
function loadSiteContext(config: BatchConfig): { contextStr: string | null } {
  if (!config.site_context_file) return { contextStr: null };
  const raw = fs.readFileSync(path.resolve(REPO_ROOT, config.site_context_file), 'utf-8');
  return { contextStr: JSON.stringify(JSON.parse(raw), null, 2) };
}

async function loadCorpus(config: BatchConfig): Promise<Corpus> {
  if (config.corpus.corpus_file) {
    const filePath = path.resolve(REPO_ROOT, config.corpus.corpus_file);
    return loadCorpusFromFile(fs.readFileSync(filePath, 'utf-8'), config.corpus.corpus_file);
  }
  return loadCorpusFromFirestore({
    memeIds: config.corpus.meme_ids === 'all' ? null : config.corpus.meme_ids,
  });
}

/**
 * Image pre-flight: the Anthropic transport silently proceeds text-only
 * when a meme image can't be fetched (app-side resilience) — for a batch
 * that would mean running a DIFFERENT experiment than declared, invisibly.
 * Verify every used meme image up front and refuse to start instead.
 */
async function imagePreflight(corpus: Corpus): Promise<void> {
  for (const meme of corpus.memes) {
    const url = meme.meme.imageUrl;
    if (!url) continue;
    if (!isSafePublicHttpsUrl(url)) {
      throw new Error(
        `meme ${meme.id} imageUrl is not a safe public https URL (${url}) — the transport would silently drop ` +
        'the image; exclude the meme or fix the URL before running',
      );
    }
    const head = await fetch(url).catch(() => null);
    if (!head || !head.ok) {
      throw new Error(
        `meme ${meme.id} image is not fetchable (${url}${head ? `, HTTP ${head.status}` : ', network error'}) — ` +
        'the transport would silently run text-only; exclude the meme or fix the URL before running',
      );
    }
  }
}

/** Frozen Pass-1 resolution for (c) cells (R1); shared by the sync loop and
 *  the batch capture/replay phases so both resolve identically. */
function makeResolveFrozenSource(db: Firestore, config: BatchConfig) {
  return async (cell: MatrixCell): Promise<FrozenPass1Source> => {
    const explicit =
      config.frozen_pass1_source && config.frozen_pass1_source !== 'batch-cell-a'
        ? config.frozen_pass1_source[cell.memeId]
        : undefined;
    const sourceDocId = explicit ?? defaultFrozenSourceDocId(config, cell);
    const snap = await getDoc(doc(db, RESEARCH_RECORDS_COLLECTION, sourceDocId));
    if (!snap.exists()) {
      throw new FrozenSourceUnavailableError(
        `cell (c) frozen source ${sourceDocId} not found — cell (a) replicate 0 must complete first ` +
        '(the deterministic ordering runs a before c; a resumed batch needs the earlier record present)',
      );
    }
    return extractFrozenSource(sourceDocId, snap.data());
  };
}

/**
 * The batch record for this launch. On --execute it is written once
 * (writeBatchRecordOnce); on resume and on --collect the STORED manifest
 * defines the batch's conditions and any drift refuses the run.
 */
async function reconcileBatchRecord(args: {
  db: Firestore;
  mode: RunMode;
  current: BatchRecord;
  extraMismatches?: (stored: BatchRecord) => string[];
}): Promise<void> {
  const { db, mode, current } = args;
  let stored: BatchRecord;
  let existed: boolean;
  if (mode === 'collect') {
    const snap = await getDoc(doc(db, RESEARCH_BATCHES_COLLECTION, current.batch_id));
    if (!snap.exists()) {
      throw new Error(`no batch record for ${current.batch_id} — nothing was ever submitted under this batch_id`);
    }
    stored = snap.data() as BatchRecord;
    existed = true;
  } else {
    ({ existed, stored } = await writeBatchRecordOnce(db, current));
  }
  if (existed) {
    const mismatches = batchResumeMismatches(stored, current);
    mismatches.push(...(args.extraMismatches?.(stored) ?? []));
    if (mismatches.length > 0) {
      throw new Error(
        `cannot resume batch ${current.batch_id}: current conditions no longer match its stored manifest —\n  ` +
        mismatches.join('\n  ') +
        '\nA changed regime is a NEW batch (new batch_id); records are comparable iff their hashes match.',
      );
    }
    console.log(`batch record exists and conditions match — resuming ${current.batch_id}`);
  } else {
    console.log(`batch record written: ${current.batch_id}`);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      config: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      execute: { type: 'boolean', default: false },
      collect: { type: 'boolean', default: false },
      transport: { type: 'string' },
      operator: { type: 'string' },
      'anthropic-batch-id': { type: 'string' },
      'budget-cap': { type: 'string' },
    },
  });

  if (!values.config) {
    console.error(
      'usage: research:run -- --config <batch.json> (--dry-run | --execute | --collect) ' +
      '[--transport sync|batch] [--operator <who>] [--budget-cap <usd>] [--anthropic-batch-id <msgbatch id>]',
    );
    process.exit(2);
  }
  const modeCount = [values['dry-run'], values.execute, values.collect].filter(Boolean).length;
  if (modeCount !== 1) {
    console.error(
      'Refusing to run without exactly one mode: --dry-run to price the batch, --execute to run/submit it, ' +
      'or --collect to collect batch-transport results.',
    );
    process.exit(2);
  }
  const mode: RunMode = values['dry-run'] ? 'dry-run' : values.execute ? 'execute' : 'collect';

  if (values.transport !== undefined && values.transport !== 'sync' && values.transport !== 'batch') {
    console.error(`--transport must be "sync" or "batch" (got "${values.transport}")`);
    process.exit(2);
  }
  if (mode === 'collect' && values.transport === 'sync') {
    console.error('--collect retrieves Message Batches results — it has no sync form; drop --transport sync.');
    process.exit(2);
  }
  const transport: Transport = (values.transport as Transport | undefined) ?? (mode === 'collect' ? 'batch' : 'sync');
  if (values['anthropic-batch-id'] && mode !== 'collect') {
    console.error('--anthropic-batch-id is a --collect recovery flag (registers a batch whose submission doc write failed).');
    process.exit(2);
  }

  const operator = values.operator?.trim() || null;
  if ((mode === 'execute' || mode === 'collect') && !operator) {
    console.error(
      '--operator "<human name or session identifier>" is required for --execute/--collect — ' +
      'the batch record stores who launched the campaign (provenance).',
    );
    process.exit(2);
  }

  const configPath = path.resolve(REPO_ROOT, values.config);
  const config = parseBatchConfig(fs.readFileSync(configPath, 'utf-8'), values.config);
  if (values['budget-cap'] !== undefined) {
    const cap = Number(values['budget-cap']);
    if (!(cap > 0)) throw new Error('--budget-cap must be a positive number');
    config.budget_cap_usd = cap;
  }

  if (config.experiment === 'E1') {
    throw new Error('E1 is not runnable in this scaffold (E2 first, per the spec run order).');
  }
  if (transport === 'batch') {
    const nonAnthropic = config.models.filter((m) => m.provider !== 'anthropic');
    if (nonAnthropic.length > 0) {
      throw new Error(
        '--transport batch submits through the Anthropic Message Batches API; OpenRouter has no batch API, so ' +
        `openrouter-routed models cannot be batched: ${nonAnthropic.map((m) => m.id).join(', ')}. ` +
        'Run them as a separate sync batch config instead — routing is always explicit, never silently rerouted.',
      );
    }
  }

  console.log(`batch ${config.batch_id} — loading corpus…`);
  const corpus = await loadCorpus(config);
  console.log(
    `corpus: raw collection count ${corpus.raw_collection_count}, used ${corpus.used_count} (${corpus.filter})`,
  );

  const { regime, twoPassPromptText } = await captureRegime(REPO_ROOT);
  const { contextStr: siteContext } = loadSiteContext(config);
  const siteContextHash = siteContext !== null ? await sha256HexOfString(siteContext) : null;

  if (config.experiment === 'E3') {
    return runE3({
      config,
      corpus,
      regime,
      twoPassPromptText,
      siteContext,
      siteContextHash,
      mode,
      transport,
      operator,
      anthropicBatchId: values['anthropic-batch-id'],
    });
  }

  const cells = expandMatrix(config, corpus);

  // Estimates use the actually assembled prompt + per-meme user message.
  const systemPrompt = assembleTwoPassSystemPrompt(twoPassPromptText, siteContext);
  const estimated: Array<MatrixCell & { estimate: CellCostEstimate }> = cells.map((cell) => {
    const input = mapMemeToCuboidInput(cell.meme.meme);
    const userMessage = buildUserMessage(input.memeDescription, input.locationTag, input.engagementLevel);
    return {
      ...cell,
      estimate: estimateCellCost({
        modelId: cell.model.id,
        systemPromptChars: systemPrompt.length,
        userMessageChars: userMessage.length,
        hasImage: Boolean(cell.meme.meme.imageUrl),
        cellType: cell.cellType,
      }),
    };
  });

  // Batch-route estimates from the same inputs (what the cell actually
  // routes to under --transport batch: 50% discount + cached system prompt).
  const batchEstimates: BatchRouteEstimate[] | null =
    transport === 'batch'
      ? cells.map((cell) => {
          const input = mapMemeToCuboidInput(cell.meme.meme);
          const userMessage = buildUserMessage(input.memeDescription, input.locationTag, input.engagementLevel);
          return estimateBatchRoute({
            modelId: cell.model.id,
            systemPromptChars: systemPrompt.length,
            userMessageChars: userMessage.length,
            hasImage: Boolean(cell.meme.meme.imageUrl),
            cellType: cell.cellType,
            cacheTtl: BATCH_CACHE_TTL,
          });
        })
      : null;

  const table = renderDryRunTable(estimated);
  for (const line of table.lines) console.log(line);
  if (batchEstimates) {
    const totals = batchRouteTotals(cells.map((cell, i) => ({ modelId: cell.model.id, est: batchEstimates[i] })));
    for (const line of renderBatchPricingLines(totals, BATCH_CACHE_TTL)) console.log(line);
  }

  if (mode === 'dry-run') {
    console.log('dry run — no model called, nothing written.');
    return;
  }

  if (transport === 'sync') {
    if (config.budget_cap_usd !== null && table.total_usd > config.budget_cap_usd) {
      throw new Error(
        `batch estimate $${table.total_usd.toFixed(4)} exceeds budget cap $${config.budget_cap_usd.toFixed(2)} — not starting`,
      );
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() || null;
    const openRouterKey = process.env.OPENROUTER_API_KEY?.trim() || null;

    await imagePreflight(corpus);

    const { db } = await initHeadlessFirebase();

    // R1: probe assistant-prefill support once per model that needs it.
    const prefillSupport = new Map<string, boolean>();
    if (config.cells.includes('c')) {
      for (const model of config.models) {
        if (!needsPrefillProbe(model)) {
          prefillSupport.set(model.id, true);
          continue;
        }
        if (!openRouterKey) throw new Error(`cannot probe prefill support for ${model.id}: OPENROUTER_API_KEY unset`);
        console.log(`probing assistant-prefill support: ${model.id}…`);
        const supported = await probePrefillSupport(model.id, openRouterKey);
        prefillSupport.set(model.id, supported);
        console.log(`  → ${supported ? 'supported' : 'NOT supported — cell (c) will be skipped for this model (R1)'}`);
      }
    }

    const batchRecord = buildBatchRecord({
      config,
      corpus,
      regime,
      siteContextHash,
      appCommit: appCommit(),
      operator: operator!,
      cellCount: cells.length,
      costEstimateUsd: table.total_usd,
      notes: [...prefillSupport.entries()]
        .filter(([, ok]) => !ok)
        .map(([id]) => `prefill_supported=false for ${id}; cell (c) skipped per R1`),
    });
    await reconcileBatchRecord({ db, mode, current: batchRecord });

    const ctx: TranslationCellContext = {
      config,
      regime,
      twoPassPromptText,
      siteContext,
      siteContextHash,
      appCommit: appCommit(),
      anthropicKey,
      openRouterKey,
      resolveFrozenSource: makeResolveFrozenSource(db, config),
      prefillSupport,
    };

    let spentEstimate = 0;
    let written = 0;
    let skipped = 0;
    let deferredFrozen = 0;

    for (const cell of cells) {
      if (await researchRecordExists(db, cell.docId)) {
        skipped++;
        console.log(`skip (exists): ${cell.docId}`);
        continue;
      }
      const est = estimated[cell.index].estimate.usd;
      if (config.budget_cap_usd !== null && spentEstimate + est > config.budget_cap_usd) {
        console.error(
          `budget cap reached: spent est. $${spentEstimate.toFixed(4)} + next cell $${est.toFixed(4)} ` +
          `> cap $${config.budget_cap_usd.toFixed(2)} — aborting (resume with the same batch_id after raising the cap)`,
        );
        process.exit(1);
      }

      let result;
      try {
        result = await runTranslationCell(ctx, cell);
      } catch (err) {
        if (err instanceof FrozenSourceUnavailableError) {
          // Skip WITHOUT writing: the append-only dataset keeps the cell open,
          // so a resume (e.g. after pinning a different source record via
          // frozen_pass1_source) can still fill it. Nothing burned, nothing
          // wedged — the batch carries on.
          deferredFrozen++;
          console.warn(`defer (frozen source unavailable): ${cell.docId} — ${err.message}`);
          continue;
        }
        throw err; // misconfiguration (keys, model id) — abort, resumable
      }
      await writeResearchRecord(db, result.record, { docId: cell.docId });
      spentEstimate += result.estimate.usd;
      written++;
      console.log(
        `${cell.docId}: ${result.record.payload.parse_status}` +
        (result.called ? '' : ' (no model call)') +
        ` — est. $${result.estimate.usd.toFixed(4)}`,
      );
    }

    console.log(
      `done: ${written} written, ${skipped} skipped (already present), ` +
      `${deferredFrozen} deferred (frozen source unavailable — not written; re-run after fixing the source), ` +
      `est. spend $${spentEstimate.toFixed(4)}`,
    );
    if (deferredFrozen > 0) process.exitCode = 1;
    return;
  }

  // -------------------------------------------------------------------------
  // transport=batch: submit (--execute) or collect (--collect)
  // -------------------------------------------------------------------------

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() || null;
  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY is required for --transport batch (submit and collect both talk to the Batch API)');

  if (mode === 'execute') await imagePreflight(corpus);

  const { db } = await initHeadlessFirebase();

  // All batch models are anthropic-routed (checked above) — prefill is
  // native, no probes needed (R1 probes exist for non-Anthropic OpenRouter
  // providers only).
  const prefillSupport = new Map<string, boolean>(config.models.map((m) => [m.id, true]));

  const batchRecord = buildBatchRecord({
    config,
    corpus,
    regime,
    siteContextHash,
    appCommit: appCommit(),
    operator: operator!,
    cellCount: cells.length,
    costEstimateUsd: table.total_usd,
    notes: [
      'transport=batch: cost_estimate_usd is the sync-basis figure for cross-transport comparison; ' +
      'per-round batch-route estimates (worst/best case) live in the __submission__ docs',
    ],
  });
  await reconcileBatchRecord({ db, mode, current: batchRecord });

  const cellCtx: TranslationCellContext = {
    config,
    regime,
    twoPassPromptText,
    siteContext,
    siteContextHash,
    appCommit: appCommit(),
    anthropicKey,
    openRouterKey: null,
    resolveFrozenSource: makeResolveFrozenSource(db, config),
    prefillSupport,
  };

  const units: BatchUnit[] = cells.map((cell, i) => makeE2BatchUnit(cell, cellCtx, anthropicKey, batchEstimates![i]));
  const roundCtx: BatchRoundContext = {
    db,
    anthropicKey,
    batchId: config.batch_id,
    operator: operator!,
    appCommit: appCommit(),
    cacheTtl: BATCH_CACHE_TTL,
    budgetCapUsd: config.budget_cap_usd,
    imageCache: new Map(),
  };

  if (mode === 'execute') {
    await submitBatchRound(roundCtx, units);
  } else {
    await collectBatchRound(roundCtx, units, { registerAnthropicBatchId: values['anthropic-batch-id'] });
  }
}

// ---------------------------------------------------------------------------
// E3 — step-mode replay (ruling R2; wired on Iddo's go, 2026-08-31)
// ---------------------------------------------------------------------------

async function runE3(args: {
  config: BatchConfig;
  corpus: Corpus;
  regime: Awaited<ReturnType<typeof captureRegime>>['regime'];
  twoPassPromptText: string;
  siteContext: string | null;
  siteContextHash: string | null;
  mode: RunMode;
  transport: Transport;
  operator: string | null;
  anthropicBatchId?: string;
}): Promise<void> {
  const { config, corpus, regime, twoPassPromptText, siteContext, siteContextHash, mode, transport, operator } = args;

  const stateFile = path.resolve(REPO_ROOT, config.e3!.state_file);
  const state = parseFrozenEvolveState(fs.readFileSync(stateFile, 'utf-8'), config.e3!.state_file);
  const stateHash = await hashEvolveState(state);

  // The frozen conditions must be the CURRENT conditions, verified by hash —
  // replaying a state against a different site context or lexicon would
  // measure something other than what the state declares.
  if (state.site_context_hash !== siteContextHash) {
    throw new Error(
      `frozen state expects site_context_hash ${state.site_context_hash ?? 'null'} but the batch provides ` +
      `${siteContextHash ?? 'null'} — point site_context_file at the exact context the state was captured with`,
    );
  }
  if (state.translation_lexicon_hash !== regime.translation_lexicon_hash) {
    throw new Error(
      `frozen state expects translation_lexicon_hash ${state.translation_lexicon_hash} but the current default ` +
      `lexicon hashes to ${regime.translation_lexicon_hash} — the lexicon changed since capture; a replay under a ` +
      'changed lexicon is a NEW regime, not this state',
    );
  }

  // Pool content hashes verified against the corpus here — a meme that
  // changed since capture fails loudly before any spend.
  const requests = buildStepTranslationRequests(state, corpus);
  console.log(
    `frozen state ${stateHash.slice(0, 12)}…: generation ${state.generation_index}, ` +
    `${requests.length} candidates/step, criterion ${state.selection_criterion_id}`,
  );

  const systemPrompt = assembleTwoPassSystemPrompt(twoPassPromptText, siteContext);
  const units: Array<{ model: BatchModelConfig; replicateIndex: number; docId: string; estimate: ReturnType<typeof estimateStepCost> }> = [];
  for (const model of config.models) {
    const estimate = estimateStepCost({ modelId: model.id, systemPromptChars: systemPrompt.length, requests });
    for (let r = 0; r < config.replicates; r++) {
      units.push({ model, replicateIndex: r, docId: stepDocId(config.batch_id, stateHash, model, r), estimate });
    }
  }

  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(pad('model', 30) + pad('steps', 7) + pad('calls/step', 12) + pad('tok_in/step', 13) + pad('tok_out/step', 14) + 'est. USD');
  console.log('-'.repeat(90));
  let total = 0;
  for (const model of config.models) {
    const perStep = units.find((u) => u.model === model)!.estimate;
    const subtotal = perStep.usd * config.replicates;
    total += subtotal;
    console.log(
      pad(model.id.slice(0, 28), 30) + pad(String(config.replicates), 7) + pad(String(requests.length), 12) +
      pad(String(perStep.tokens_in), 13) + pad(String(perStep.tokens_out), 14) + `$${subtotal.toFixed(4)}`,
    );
    if (!perStep.pricing_known) {
      console.log(`NOTE: no pricing entry for ${model.id} — default pricing used (scripts/research/lib/costs.ts)`);
    }
  }
  console.log('-'.repeat(90));
  console.log(`${units.length} step replicates (${units.length * requests.length} model calls), estimated total $${total.toFixed(4)}`);

  // Batch-route pricing: one row per CALL (candidate × step replicate).
  const perCallEstimates = new Map<string, BatchRouteEstimate[]>();
  if (transport === 'batch') {
    for (const model of config.models) {
      perCallEstimates.set(
        model.id,
        requests.map((request) => {
          const userMessage = buildUserMessage(request.memeDescription, request.locationTag, request.engagementLevel);
          return estimateBatchRoute({
            modelId: model.id,
            systemPromptChars: systemPrompt.length,
            userMessageChars: userMessage.length,
            hasImage: Boolean(request.memeImageUrl),
            cellType: 'a', // full two-pass output per candidate
            cacheTtl: BATCH_CACHE_TTL,
          });
        }),
      );
    }
    const rows = units.flatMap((u) => perCallEstimates.get(u.model.id)!.map((est) => ({ modelId: u.model.id, est })));
    for (const line of renderBatchPricingLines(batchRouteTotals(rows), BATCH_CACHE_TTL)) console.log(line);
  }

  if (mode === 'dry-run') {
    console.log('dry run — no model called, nothing written.');
    return;
  }

  const e3Manifest = {
    state_file: config.e3!.state_file,
    state_hash: stateHash,
    generation_index: state.generation_index,
    candidates_per_step: requests.length,
    selection_criterion_id: state.selection_criterion_id,
  };
  const e3Mismatches = (stored: BatchRecord): string[] =>
    stored.matrix.e3?.state_hash !== stateHash
      ? [`frozen state hash changed (stored ${stored.matrix.e3?.state_hash ?? 'none'}, current ${stateHash})`]
      : [];

  if (transport === 'sync') {
    if (config.budget_cap_usd !== null && total > config.budget_cap_usd) {
      throw new Error(
        `batch estimate $${total.toFixed(4)} exceeds budget cap $${config.budget_cap_usd.toFixed(2)} — not starting`,
      );
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() || null;
    const openRouterKey = process.env.OPENROUTER_API_KEY?.trim() || null;
    const { db } = await initHeadlessFirebase();

    const batchRecord = buildBatchRecord({
      config,
      corpus,
      regime,
      siteContextHash,
      appCommit: appCommit(),
      operator: operator!,
      cellCount: units.length,
      costEstimateUsd: total,
      ordering: 'config model order × step replicate ascending',
      docIdScheme: '<batch_id>__E3__evolve_step__state-<state_hash 12>__<provider>_<model id, / → ~ and . → ->__r<replicate>',
      e3: e3Manifest,
    });
    await reconcileBatchRecord({ db, mode, current: batchRecord, extraMismatches: e3Mismatches });

    const ctx: EvolveStepContext = {
      config,
      regime,
      twoPassPromptText,
      siteContext,
      siteContextHash,
      appCommit: appCommit(),
      anthropicKey,
      openRouterKey,
      state,
      stateHash,
      requests,
    };

    let spentEstimate = 0;
    let written = 0;
    let skipped = 0;

    for (const unit of units) {
      if (await researchRecordExists(db, unit.docId)) {
        skipped++;
        console.log(`skip (exists): ${unit.docId}`);
        continue;
      }
      if (config.budget_cap_usd !== null && spentEstimate + unit.estimate.usd > config.budget_cap_usd) {
        console.error(
          `budget cap reached: spent est. $${spentEstimate.toFixed(4)} + next step $${unit.estimate.usd.toFixed(4)} ` +
          `> cap $${config.budget_cap_usd.toFixed(2)} — aborting (resume with the same batch_id after raising the cap)`,
        );
        process.exit(1);
      }

      const result = await runEvolveStep(ctx, unit.model, unit.replicateIndex);
      await writeResearchRecord(db, result.record, { docId: unit.docId });
      spentEstimate += result.estimate.usd;
      written++;
      const okCount = Object.keys(result.record.payload.ranking_scores).length;
      console.log(
        `${unit.docId}: ${result.record.payload.parse_status} — ${okCount}/${requests.length} candidates parsed, ` +
        `selected ${result.record.payload.selected_candidate ?? 'none'} — est. $${result.estimate.usd.toFixed(4)}`,
      );
    }

    console.log(`done: ${written} written, ${skipped} skipped (already present), est. spend $${spentEstimate.toFixed(4)}`);
    return;
  }

  // transport=batch
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() || null;
  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY is required for --transport batch (submit and collect both talk to the Batch API)');
  const { db } = await initHeadlessFirebase();

  const batchRecord = buildBatchRecord({
    config,
    corpus,
    regime,
    siteContextHash,
    appCommit: appCommit(),
    operator: operator!,
    cellCount: units.length,
    costEstimateUsd: total,
    ordering: 'config model order × step replicate ascending',
    docIdScheme: '<batch_id>__E3__evolve_step__state-<state_hash 12>__<provider>_<model id, / → ~ and . → ->__r<replicate>',
    e3: e3Manifest,
    notes: [
      'transport=batch: cost_estimate_usd is the sync-basis figure for cross-transport comparison; ' +
      'per-round batch-route estimates (worst/best case) live in the __submission__ docs',
    ],
  });
  await reconcileBatchRecord({ db, mode, current: batchRecord, extraMismatches: e3Mismatches });

  const stepCtx: EvolveStepContext = {
    config,
    regime,
    twoPassPromptText,
    siteContext,
    siteContextHash,
    appCommit: appCommit(),
    anthropicKey,
    openRouterKey: null,
    state,
    stateHash,
    requests,
  };

  const batchUnits: BatchUnit[] = units.map((unit) =>
    makeE3BatchUnit(unit.model, unit.replicateIndex, unit.docId, stepCtx, anthropicKey, perCallEstimates.get(unit.model.id)!),
  );
  const roundCtx: BatchRoundContext = {
    db,
    anthropicKey,
    batchId: config.batch_id,
    operator: operator!,
    appCommit: appCommit(),
    cacheTtl: BATCH_CACHE_TTL,
    budgetCapUsd: config.budget_cap_usd,
    imageCache: new Map(),
  };

  if (mode === 'execute') {
    await submitBatchRound(roundCtx, batchUnits);
  } else {
    await collectBatchRound(roundCtx, batchUnits, { registerAnthropicBatchId: args.anthropicBatchId });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
