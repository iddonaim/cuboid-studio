import { type SpatialLexicon } from '../../prompts/lexicon.default';
import { useLexiconStore } from '../../store/useLexiconStore';
import { isDemoMode } from '../demo/demoMode';
import { isDemoRecordMode } from '../demo/recorder';
import { NETWORK_FALLBACK_TIMEOUT_MS, fetchWithTimeout, isNetworkFailure } from './networkTimeout';

export interface EncodeSpaceImage {
  base64: string;
  mediaType: string;
  isPrimary?: boolean;
}

import type { SiteContextData } from '../storage/siteContext';

/** One already-applied cut, summarised for the encode prompt. Orientation is
 *  the point: a cut's meaning changes with its rotation (which compounds with
 *  the cube's own rotation), so the model reads operated cubes through both.
 *  Short enum-like tokens and numbers only — no free text can ride along. */
export interface SeedOperatorSummary {
  operator: string;
  cutterType: string;
  /** Cutter rotation in degrees, cube-local. */
  cutterRotation: [number, number, number];
  magnitude: number;
}

/** One already-placed cube, summarised for the encode prompt (merge/remix).
 *  Compact on purpose — no ids, no free text — the server re-serialises it
 *  from whitelisted fields before it reaches the model. */
export interface SeedAssemblyCube {
  variationId: string;
  position: [number, number, number];
  rotation: { x: number; y: number };
  /** How many pataphysical operators have already cut this cube. */
  operatorCount: number;
  /** Per-cut detail (operator, cutter shape + rotation, magnitude). */
  operators?: SeedOperatorSummary[];
}

/** Fields common to both single- and multi-image requests. `model` is an
 *  OpenRouter-style id (e.g. "google/gemini-3.5-flash") sent by the encode
 *  Model lab; omit it for a normal encode to keep the deployed default. */
interface EncodeSpaceCommon {
  siteContext?: SiteContextData | null;
  model?: string;
  /** Merge/remix: the assembly already placed (merge) or the saved seed to
   *  reinterpret (remix), so the model doesn't propose cubes blind. */
  seedAssembly?: SeedAssemblyCube[];
  /** Which grammar slot the seed fills. Defaults to 'merge' server-side. */
  seedMode?: 'merge' | 'remix';
}

export type EncodeSpaceRequest =
  | ({ imageBase64: string; imageMediaType?: string } & EncodeSpaceCommon)
  | ({ images: EncodeSpaceImage[] } & EncodeSpaceCommon);

export interface EncodedCube {
  /** Stable client-side id, assigned by the encoding store when a result
   *  lands — the API never returns one. Re-loading the same result into the
   *  builder reuses these ids, so per-cube state keyed by id (operator
   *  history, evolution candidates) survives the round-trip. */
  id?: string;
  variationId: string;
  position: [number, number, number];
  rotation: { x: number; y: number };
  /** Remix only ("Transplant"): the model asks for the discarded seed cube's
   *  operators to be re-applied to this replacement body. */
  inheritOperators?: boolean;
  /** Client-side (remix): which seed cube's operator history this cube
   *  carries forward — its own id for kept cubes, the replaced cube's id for
   *  transplants. Assigned by processRemixResult, never by the API. */
  inheritFromSeedId?: string;
}

// --- Reading types ----------------------------------------------------------

export interface ContinuousAxisReading {
  phrase: string;
  position: number; // 0–1; never display this number to the user
}

export interface CategoricalAxisReading {
  phrase: string;
  option: string;
}

export interface SpatialReading {
  atmosphere: ContinuousAxisReading;
  light: ContinuousAxisReading;
  emotion: ContinuousAxisReading;
  rhythm: CategoricalAxisReading;
  placement: CategoricalAxisReading;
}

// --- Response ---------------------------------------------------------------

export interface EncodeSpaceResponse {
  reading?: SpatialReading;
  reasoning: string;
  cubes: EncodedCube[];
  /** Model id the server actually used (echoed back for provenance). */
  model?: string;
  /** "# version: N" header of the grammar template that produced this encode.
   *  Absent from older recorded responses. */
  promptVersion?: string;
  /** True when a remix seed was actually injected into the prompt (the
   *  grammar file contains the remix section AND a non-empty seed arrived).
   *  The client treats the result as a full replacement assembly only when
   *  this is set — otherwise it falls back to the legacy overlay behaviour,
   *  so a not-yet-pasted grammar section can never destroy a saved seed. */
  remixApplied?: boolean;
}

/** The base64 payload that identifies "which photo": the primary (or only) image. */
function primaryImageBase64(request: EncodeSpaceRequest): string {
  if ('images' in request) {
    const primary = request.images.find(i => i.isPrimary) ?? request.images[0];
    return primary?.base64 ?? '';
  }
  return request.imageBase64;
}

/**
 * Replay/record key for the offline demo. Standalone encodes stay keyed by the
 * photo fingerprint alone (old recordings keep working). A merge encode that
 * carries a seed appends a fingerprint of the seed assembly, so a recorded
 * standalone encode can never silently replay for a merge request — an
 * unrecorded merge fails loudly with "no recorded encode" instead.
 */
function demoReplayKey(
  request: EncodeSpaceRequest,
  hash: (payload: string) => string,
): string {
  const imageKey = hash(primaryImageBase64(request));
  const seed = 'seedAssembly' in request ? request.seedAssembly : undefined;
  if (!seed || seed.length === 0) return imageKey;
  // Merge and remix carry the same seed shape but mean opposite things, so
  // they never share a recording.
  const prefix = request.seedMode === 'remix' ? 'remix' : 'seed';
  return `${imageKey}:${prefix}-${hash(JSON.stringify(seed))}`;
}

export async function encodeSpace(request: EncodeSpaceRequest): Promise<EncodeSpaceResponse> {
  // Offline demo: replay the recorded reading for this exact photo (and, in
  // merge mode, this exact seed). The encoding animation and everything
  // downstream run unchanged.
  if (isDemoMode()) {
    const { getDemoEncode } = await import('../demo/bundle');
    const { hashImageBase64 } = await import('../demo/recorder');
    return getDemoEncode(demoReplayKey(request, hashImageBase64));
  }

  const siteContext =
    'siteContext' in request && request.siteContext ? request.siteContext : undefined;

  // Send the active lexicon so the server composes the grammar prompt from it.
  // null activeLexiconId falls back to DEFAULT_LEXICON inside getActiveLexicon().
  const lexicon: SpatialLexicon = useLexiconStore.getState().getActiveLexicon();

  const modelOverride = request.model ? { model: request.model } : {};
  const seedAssembly =
    request.seedAssembly && request.seedAssembly.length > 0
      ? { seedAssembly: request.seedAssembly, seedMode: request.seedMode ?? 'merge' }
      : {};

  const body =
    'images' in request
      ? { images: request.images, lexicon, ...modelOverride, ...seedAssembly, ...(siteContext ? { siteContext } : {}) }
      : {
          imageBase64: request.imageBase64,
          imageMediaType: request.imageMediaType || 'image/jpeg',
          lexicon,
          ...modelOverride,
          ...seedAssembly,
          ...(siteContext ? { siteContext } : {}),
        };

  let response: Response;
  try {
    response = await fetchWithTimeout('/api/encode-space', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Timeout or dropped connection (not a server error — the server never
    // answered): fall back to a cached reading for this exact photo (and, in
    // merge mode, this exact seed) if one was saved earlier. A new/improvised
    // photo with no saved match still fails, with a clear reason instead of a
    // silently faked reading.
    if (isNetworkFailure(err)) {
      try {
        const { getDemoEncode } = await import('../demo/bundle');
        const { hashImageBase64 } = await import('../demo/recorder');
        const result = await getDemoEncode(demoReplayKey(request, hashImageBase64));
        console.warn(
          `[network-fallback] encode-space: no response within ${NETWORK_FALLBACK_TIMEOUT_MS / 1000}s — served a saved result instead.`,
        );
        return result;
      } catch {
        throw new Error(
          `Couldn't reach the server (waited ${NETWORK_FALLBACK_TIMEOUT_MS / 1000}s), and this photo hasn't been ` +
            'encoded and saved before, so there is nothing to fall back on. Check the connection and try again.',
        );
      }
    }
    throw err;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorData.error || `Encoding failed (${response.status})`);
  }

  const result = (await response.json()) as EncodeSpaceResponse;

  // ?demoRecord: capture this encode, keyed to the exact photo (plus the seed
  // fingerprint in merge mode), for offline replay.
  if (isDemoRecordMode()) {
    const { recordEncode, hashImageBase64 } = await import('../demo/recorder');
    recordEncode({ imageHash: demoReplayKey(request, hashImageBase64), response: result });
  }

  return result;
}
