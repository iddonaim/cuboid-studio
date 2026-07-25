/**
 * Plan-underlay import for the Decode canvas.
 *
 * Reuses the encode-photo resize pipeline (longest edge capped, plus a ~240px
 * thumbnail) so the persistence policy is identical: saved compositions carry
 * thumbnail + fingerprint + registration, never full-res base64.
 */
import { resizeImageToBase64 } from '../encoding/resizeImageToBase64';
import { hashImageBase64 } from '../demo/recorder';
import { TILE_SIZE } from './snapUtils';
import type { DecodeUnderlay } from '../../store/useDecodeStore';

/** Default registration: the plan's longest edge spans about six tiles. */
const DEFAULT_SPAN_TILES = 6;

function imageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to read plan image'));
    img.src = dataUrl;
  });
}

/** Read a plan image file into a fresh underlay with identity registration. */
export async function importPlanUnderlay(file: File): Promise<DecodeUnderlay> {
  const { base64, mediaType, thumbnailDataUrl } = await resizeImageToBase64(file);
  const dataUrl = `data:${mediaType};base64,${base64}`;
  const { width, height } = await imageDimensions(dataUrl);
  const scale = (DEFAULT_SPAN_TILES * TILE_SIZE) / Math.max(width, height);
  return {
    dataUrl,
    thumbnailDataUrl,
    imageHash: hashImageBase64(base64),
    width,
    height,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    scale,
  };
}
