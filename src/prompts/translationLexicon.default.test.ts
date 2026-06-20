import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  DEFAULT_TRANSLATION_LEXICON,
  OPERATOR_IDS,
  EDGE_TYPE_IDS,
  composeTranslationPrompt,
  isTranslationLexicon,
  type TranslationLexicon,
} from './translationLexicon.default';

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = readFileSync(path.join(here, 'pataphysical-translation-v2.md'), 'utf-8');

function clone(lex: TranslationLexicon): TranslationLexicon {
  return JSON.parse(JSON.stringify(lex));
}

describe('composeTranslationPrompt — default lexicon', () => {
  const composed = composeTranslationPrompt(TEMPLATE, DEFAULT_TRANSLATION_LEXICON);

  it('fills every {{slot}} (none left behind)', () => {
    expect(composed).not.toMatch(/\{\{[a-z_]+\}\}/);
  });

  it('leaves the single-brace {site_context} placeholder for the API to fill', () => {
    expect(composed).toContain('{site_context}');
  });

  it('renders every operator and edge type into the prompt', () => {
    for (const op of OPERATOR_IDS) expect(composed).toContain(`**${op}**`);
    for (const edge of EDGE_TYPE_IDS) expect(composed).toContain(`- **${edge}**:`);
  });

  it('preserves the move→operator mapping behind the #62 bug', () => {
    // Juxtaposition must map to the `reassignment` operator, never to itself.
    expect(composed).toContain('- Juxtaposition → **reassignment** (swap edge targets between unlike elements)');
    expect(composed).toContain('- **Irony**: saying the opposite of what is meant');
  });

  it('is a byte-stable regression guard (snapshot of the composed default)', () => {
    // Locks the composed default prompt byte-for-byte. If a future edit to the
    // template or the default lexicon changes the prompt the model receives,
    // this fails loudly — the formalised version of the ad-hoc check run when
    // the feature was built.
    expect(composed).toMatchSnapshot();
  });
});

describe('composeTranslationPrompt — custom lexicon', () => {
  it('flows custom wording into the composed prompt', () => {
    const custom = clone(DEFAULT_TRANSLATION_LEXICON);
    custom.rhetorical_moves[0].definition = 'CUSTOM_IRONY_DEFINITION';
    custom.edge_types[0].definition = 'CUSTOM_ADJACENCY_DEFINITION';
    const out = composeTranslationPrompt(TEMPLATE, custom);
    expect(out).toContain('CUSTOM_IRONY_DEFINITION');
    expect(out).toContain('CUSTOM_ADJACENCY_DEFINITION');
    expect(out).not.toMatch(/\{\{[a-z_]+\}\}/);
    expect(out).toContain('{site_context}');
  });
});

describe('isTranslationLexicon', () => {
  it('accepts the built-in default', () => {
    expect(isTranslationLexicon(DEFAULT_TRANSLATION_LEXICON)).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(isTranslationLexicon(null)).toBe(false);
    expect(isTranslationLexicon(undefined)).toBe(false);
    expect(isTranslationLexicon('lexicon')).toBe(false);
    expect(isTranslationLexicon(42)).toBe(false);
  });

  it('rejects an empty object', () => {
    expect(isTranslationLexicon({})).toBe(false);
  });

  it('rejects empty or missing arrays', () => {
    expect(isTranslationLexicon({ ...DEFAULT_TRANSLATION_LEXICON, rhetorical_moves: [] })).toBe(false);
    const noEdges = clone(DEFAULT_TRANSLATION_LEXICON) as unknown as Record<string, unknown>;
    delete noEdges.edge_types;
    expect(isTranslationLexicon(noEdges)).toBe(false);
  });

  it('rejects entries with the wrong field types', () => {
    const badMove = clone(DEFAULT_TRANSLATION_LEXICON);
    // @ts-expect-error — deliberately corrupting a field for the test
    badMove.rhetorical_moves[0].operator = 42;
    expect(isTranslationLexicon(badMove)).toBe(false);

    const badDecay = clone(DEFAULT_TRANSLATION_LEXICON) as unknown as Record<string, unknown>;
    badDecay.decay = { viral: 'x', niche: 'y' }; // missing `default`
    expect(isTranslationLexicon(badDecay)).toBe(false);
  });
});

describe('fixed token sets', () => {
  it('exposes nine unique operators and six unique edge types', () => {
    expect(OPERATOR_IDS).toHaveLength(9);
    expect(new Set(OPERATOR_IDS).size).toBe(9);
    expect(EDGE_TYPE_IDS).toHaveLength(6);
    expect(new Set(EDGE_TYPE_IDS).size).toBe(6);
  });

  it('keeps the default lexicon within the fixed token sets', () => {
    // Guards against the default drifting to an operator/edge the API validator
    // would reject — the same class of failure as the #62 bug.
    for (const m of DEFAULT_TRANSLATION_LEXICON.rhetorical_moves) {
      expect(OPERATOR_IDS).toContain(m.operator);
    }
    for (const e of DEFAULT_TRANSLATION_LEXICON.edge_types) {
      expect(EDGE_TYPE_IDS).toContain(e.id);
    }
  });
});
