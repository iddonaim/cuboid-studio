export interface EncodeSpaceImage {
  base64: string;
  mediaType: string;
  isPrimary?: boolean;
}

import type { SiteContextData } from '../storage/siteContext';

export type EncodeSpaceRequest =
  | { imageBase64: string; imageMediaType?: string; siteContext?: SiteContextData | null }
  | { images: EncodeSpaceImage[]; siteContext?: SiteContextData | null };

export interface EncodedCube {
  variationId: string;
  position: [number, number, number];
  rotation: { x: number; y: number };
}

export interface EncodeSpaceResponse {
  reasoning: string;
  cubes: EncodedCube[];
}

export async function encodeSpace(request: EncodeSpaceRequest): Promise<EncodeSpaceResponse> {
  const siteContext =
    'siteContext' in request && request.siteContext ? request.siteContext : undefined;

  const body =
    'images' in request
      ? { images: request.images, ...(siteContext ? { siteContext } : {}) }
      : {
          imageBase64: request.imageBase64,
          imageMediaType: request.imageMediaType || 'image/jpeg',
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
