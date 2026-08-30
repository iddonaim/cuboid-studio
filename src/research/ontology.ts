/**
 * POETIKS system-section ontology ids, for stamping research records
 * (ruling R3, Step 3 rulings 2026-08-30).
 *
 * Source: poetiks_system_section_data_v6.json
 *   (Drive /thesis/diagrams/production/)
 *   meta.version: "Section data v6 — 2026-08-07. Supersedes both prior files
 *   of that number." (leading identifier of the full version note)
 *
 * The id lists below are copied verbatim from that file:
 *   - stages[].id
 *   - bands[].id
 *   - the actor vocabulary as used on nodes (`actor`) and edges (the
 *     deliverer, edges[][3]) — the bare forms, not the "actor_*" node ids.
 *
 * These are constants, not editable vocabulary: a record that does not fit
 * one of these ids carries null for that field (per R3 — never invent ids).
 */

export const ONTOLOGY_SOURCE = {
  file: 'poetiks_system_section_data_v6.json',
  location: 'Drive /thesis/diagrams/production/',
  version: 'Section data v6 — 2026-08-07',
} as const;

export const STAGES = ['map', 'encode', 'evolve', 'decode'] as const;
export type Stage = (typeof STAGES)[number];

export const BANDS = [
  'surface',
  'agency',
  'llm',
  'deterministic',
  'artifact',
  'roots',
] as const;
export type Band = (typeof BANDS)[number];

export const ACTORS = ['architect', 'user', 'llm', 'external'] as const;
export type Actor = (typeof ACTORS)[number];

/** The ontology block every Phase-0 record carries (envelope.ontology). */
export interface RecordOntology {
  stage: Stage | null;
  band: Band | null;
  actor: Actor | null;
  deliverer: Actor | null;
}

export type ResearchKind = 'encode' | 'translation' | 'evolve_step' | 'judgment';

/**
 * Phase-0 kind → ontology mapping, per R3:
 *   encode      → stage encode, band llm
 *   translation → stage evolve, band llm
 *   evolve_step → stage evolve, band deterministic
 *   judgment    → band agency, actor architect
 *
 * Fields R3 leaves open are filled as follows (noted, not invented ids):
 *   - actor for encode/translation is `llm` (the v6 nodes that run these
 *     calls, encode_llm / evolve_llm, carry actor "llm"); for evolve_step it
 *     is `architect` (evolve_engine's actor).
 *   - deliverer is `architect` for every Phase-0 record: R3 defines the
 *     deliverer as "the actor whose call produced the record", and every
 *     record here is produced by the architect's research harness. (The v6
 *     arrow-colour law would instead attribute model *output* to `llm`; the
 *     ruling's literal definition wins — flagged in the build report.)
 *   - judgment has no single stage in the v6 section (a judge can rule on any
 *     experiment), so its stage is null per R3's "leave the field null".
 */
export const PHASE0_ONTOLOGY: Record<ResearchKind, RecordOntology> = {
  encode: { stage: 'encode', band: 'llm', actor: 'llm', deliverer: 'architect' },
  translation: { stage: 'evolve', band: 'llm', actor: 'llm', deliverer: 'architect' },
  evolve_step: { stage: 'evolve', band: 'deterministic', actor: 'architect', deliverer: 'architect' },
  judgment: { stage: null, band: 'agency', actor: 'architect', deliverer: 'architect' },
};

export function isValidOntology(o: unknown): o is RecordOntology {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const rec = o as Record<string, unknown>;
  const keys = ['stage', 'band', 'actor', 'deliverer'];
  if (Object.keys(rec).some((k) => !keys.includes(k))) return false;
  const okIn = (v: unknown, list: readonly string[]) =>
    v === null || (typeof v === 'string' && list.includes(v));
  return (
    okIn(rec.stage, STAGES) &&
    okIn(rec.band, BANDS) &&
    okIn(rec.actor, ACTORS) &&
    okIn(rec.deliverer, ACTORS)
  );
}
