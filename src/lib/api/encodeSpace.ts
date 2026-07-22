import { type SpatialLexicon } from '../../prompts/lexicon.default';
import { useLexiconStore } from '../../store/useLexiconStore';
import { isDemoMode } from '../demo/demoMode';
import { isDemoRecordMode } from '../demo/recorder';

export interface EncodeSpaceImage {
  base64: string;
  mediaType: string;
  isPrimary?: boolean;
}

import type { SiteContextData } from '../storage/siteContext';

/** One already-placed cube, summarised for the encode prompt (merge mode).
 *  Compact on purpose — no ids, no free text — the server re-serialises it
 *  from whitelisted fields before it reaches the model. */
export interface SeedAssemblyCube {
  variationId: string;
  position: [number, number, number];
  rotation: { x: number; y: number };
  /** How many pataphysical operators have already cut this cube. */
  operatorCount: number;
}

/** Fields common to both single- and multi-image requests. `model` is an
 *  OpenRouter-style id (e.g. "google/gemini-3.5-flash") sent by the encode
 *  Model lab; omit it for a normal encode to keep the deployed default. */
interface EncodeSpaceCommon {
  siteContext?: SiteContextData | null;
  model?: string;
  /** Merge mode only: the assembly already placed, so the model composes its
   *  additions against it instead of proposing cubes blind. */
  seedAssembly?: SeedAssemblyCube[];
}

export type EncodeSpaceRequest =
  | ({ imageBase64: string; imageMediaType?: string } & EncodeSpaceCommon)
  | ({ images: EncodeSpaceImage[] } & EncodeSpaceCommon);

export interface EncodedCube {
  variationId: string;
  position: [number, number, number];
  rotation: { x: number; y: number };
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
  return seed && seed.length > 0 ? `${imageKey}:seed-${hash(JSON.stringify(seed))}` : imageKey;
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
      ? { seedAssembly: request.seedAssembly }
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

  const response = await fetch('/api/encode-space', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

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
