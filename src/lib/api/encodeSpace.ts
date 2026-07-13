import { type SpatialLexicon } from '../../prompts/lexicon.default';
import { useLexiconStore } from '../../store/useLexiconStore';

export interface EncodeSpaceImage {
  base64: string;
  mediaType: string;
  isPrimary?: boolean;
}

import type { SiteContextData } from '../storage/siteContext';

/** Fields common to both single- and multi-image requests. `model` is an
 *  OpenRouter-style id (e.g. "google/gemini-3.5-flash") sent by the encode
 *  Model lab; omit it for a normal encode to keep the deployed default. */
interface EncodeSpaceCommon {
  siteContext?: SiteContextData | null;
  model?: string;
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

export async function encodeSpace(request: EncodeSpaceRequest): Promise<EncodeSpaceResponse> {
  const siteContext =
    'siteContext' in request && request.siteContext ? request.siteContext : undefined;

  // Send the active lexicon so the server composes the grammar prompt from it.
  // null activeLexiconId falls back to DEFAULT_LEXICON inside getActiveLexicon().
  const lexicon: SpatialLexicon = useLexiconStore.getState().getActiveLexicon();

  const modelOverride = request.model ? { model: request.model } : {};

  const body =
    'images' in request
      ? { images: request.images, lexicon, ...modelOverride, ...(siteContext ? { siteContext } : {}) }
      : {
          imageBase64: request.imageBase64,
          imageMediaType: request.imageMediaType || 'image/jpeg',
          lexicon,
          ...modelOverride,
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

  return response.json();
}
