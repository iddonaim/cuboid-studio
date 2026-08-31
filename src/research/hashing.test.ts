import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  hashLexicon,
  hashMemeContent,
  sha256HexOfBytes,
  sha256HexOfCanonicalJson,
  sha256HexOfString,
} from './hashing';
import { DEFAULT_TRANSLATION_LEXICON } from '../prompts/translationLexicon.default';

// ---------------------------------------------------------------------------
// DoD (a): hash reproducibility. Fixed expected digests pin the algorithm
// across runs and machines — if serialization ever drifts, these fail.
// ---------------------------------------------------------------------------

describe('sha256 reproducibility', () => {
  it('hashes a known string to a known digest', async () => {
    // sha256("cuboid"), verified against `printf 'cuboid' | sha256sum` —
    // stable across runs, machines, and Node versions.
    expect(await sha256HexOfString('cuboid')).toBe(
      '4b259ee4674cfab9f6febf351288bd7967bec9bee3c5f666fc01a1a656625c5d',
    );
  });

  it('hashes bytes and their string form identically for ASCII', async () => {
    const asString = await sha256HexOfString('poetiks');
    const asBytes = await sha256HexOfBytes(new TextEncoder().encode('poetiks'));
    expect(asBytes).toBe(asString);
  });

  it('hashes a subarray view without leaking neighbouring bytes', async () => {
    const buffer = new TextEncoder().encode('xxpoetiksxx');
    const view = buffer.subarray(2, 9);
    expect(await sha256HexOfBytes(view)).toBe(await sha256HexOfString('poetiks'));
  });
});

describe('canonicalJson', () => {
  it('is invariant to key insertion order, recursively', () => {
    const a = { z: 1, a: { d: [1, 2], b: 'x' }, m: null };
    const b = { m: null, a: { b: 'x', d: [1, 2] }, z: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('preserves array order (arrays are ordered data, not sets)', () => {
    expect(canonicalJson({ t: [2, 1] })).not.toBe(canonicalJson({ t: [1, 2] }));
  });

  it('drops undefined object values, like JSON.stringify', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });

  it('refuses values JSON cannot carry losslessly', () => {
    expect(() => canonicalJson({ n: Number.NaN })).toThrow();
    expect(() => canonicalJson({ f: () => 1 })).toThrow();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => canonicalJson(circular)).toThrow();
  });

  it('refuses non-plain objects instead of collapsing them to {}', () => {
    expect(() => canonicalJson({ d: new Date(0) })).toThrow(/non-plain/);
    expect(() => canonicalJson({ m: new Map() })).toThrow(/non-plain/);
    expect(() => canonicalJson({ s: new Set([1]) })).toThrow(/non-plain/);
    // Null-prototype objects are plain data and stay hashable.
    expect(() => canonicalJson(Object.create(null))).not.toThrow();
  });

  it('produces identical object hashes regardless of key order', async () => {
    const h1 = await sha256HexOfCanonicalJson({ b: 2, a: 1 });
    const h2 = await sha256HexOfCanonicalJson({ a: 1, b: 2 });
    expect(h1).toBe(h2);
  });
});

describe('lexicon hashing', () => {
  it('hashes the built-in translation lexicon deterministically across calls', async () => {
    const h1 = await hashLexicon(DEFAULT_TRANSLATION_LEXICON);
    const h2 = await hashLexicon(JSON.parse(JSON.stringify(DEFAULT_TRANSLATION_LEXICON)));
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Meme content hash — wire truth, not the declared type (2026-08-30 addition:
// topText/bottomText/userId are ghost fields, never written by current
// publish code; the hash covers what each doc actually stores).
// ---------------------------------------------------------------------------

describe('hashMemeContent', () => {
  const currentShapeDoc = {
    imageUrl: 'https://example.test/m.jpg',
    memeText: 'text',
    description: '',
    tags: ['a'],
    location: null,
    username: '',
    likes: 4,
    hidden: false,
    timestamp: '2026-08-01T10:00:00Z',
    createdAt: '2026-08-01T10:00:00.000Z',
    originSource: 'link',
  };

  it('excludes mutable state (likes, hidden, timestamp) from the hash', async () => {
    const liked = { ...currentShapeDoc, likes: 999, hidden: true, timestamp: '2027-01-01T00:00:00Z' };
    const a = await hashMemeContent(currentShapeDoc);
    const b = await hashMemeContent(liked);
    expect(a.hash).toBe(b.hash);
    expect(a.covered_fields).not.toContain('likes');
    expect(a.covered_fields).not.toContain('hidden');
    expect(a.covered_fields).not.toContain('timestamp');
    expect(a.covered_fields).toContain('createdAt');
  });

  it('does NOT inject ghost-field defaults: a doc without topText hashes without it', async () => {
    const result = await hashMemeContent(currentShapeDoc);
    expect(result.covered_fields).not.toContain('topText');
    expect(result.covered_fields).not.toContain('bottomText');
    expect(result.covered_fields).not.toContain('userId');
  });

  it("a doc that doesn't store topText differs from one storing topText: ''", async () => {
    const withEmptyTopText = { ...currentShapeDoc, topText: '' };
    const bare = await hashMemeContent(currentShapeDoc);
    const withField = await hashMemeContent(withEmptyTopText);
    expect(bare.hash).not.toBe(withField.hash);
    expect(withField.covered_fields).toContain('topText');
  });

  it('a legacy doc really storing ghost fields has them covered as content', async () => {
    const legacy = {
      imageUrl: 'https://example.test/m.jpg',
      topText: 'MY LANDLORD',
      bottomText: 'RAISING RENT AGAIN',
      userId: 'legacy-uid-123',
      likes: 3,
      createdAt: '2026-06-15T08:30:00.000Z',
    };
    const result = await hashMemeContent(legacy);
    expect(result.covered_fields).toEqual(
      ['bottomText', 'createdAt', 'imageUrl', 'topText', 'userId'],
    );
    const differentText = await hashMemeContent({ ...legacy, topText: 'MY LANDLORD!!' });
    expect(differentText.hash).not.toBe(result.hash);
  });
});
