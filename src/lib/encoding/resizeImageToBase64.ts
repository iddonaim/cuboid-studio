/** Longest edge (px) for the thumbnail kept alongside saved compositions. */
const THUMBNAIL_MAX_DIMENSION = 240;
const THUMBNAIL_QUALITY = 0.6;

function drawToCanvas(bitmap: ImageBitmap, maxDimension: number): HTMLCanvasElement {
  let width = bitmap.width;
  let height = bitmap.height;
  const longest = Math.max(width, height);

  if (longest > maxDimension) {
    const scale = maxDimension / longest;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

/**
 * Resize a photo for the encode API: longest edge capped at maxDimension,
 * no upscaling, JPEG 0.88 or PNG output. Also produces a small JPEG
 * thumbnail (longest edge 240px) cheap enough to persist with a saved
 * composition, so a save always carries a visual record of the photo(s)
 * that informed it.
 */
export async function resizeImageToBase64(
  file: File,
  maxDimension = 1600
): Promise<{ base64: string; mediaType: string; thumbnailDataUrl: string }> {
  const bitmap = await createImageBitmap(file);

  const canvas = drawToCanvas(bitmap, maxDimension);
  const thumbCanvas = drawToCanvas(bitmap, THUMBNAIL_MAX_DIMENSION);
  bitmap.close();

  const isPng =
    file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
  const mediaType = isPng ? 'image/png' : 'image/jpeg';

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mediaType, isPng ? undefined : 0.88);
  });

  if (!blob) {
    throw new Error('Failed to encode image');
  }

  const base64 = await blobToBase64(blob);
  // PNG sources keep PNG thumbnails: a viewport capture is a transparent
  // cut-out, and a JPEG thumbnail would flatten that to black — which is
  // exactly what a restored capture-underlay would then draw.
  const thumbnailDataUrl = isPng
    ? thumbCanvas.toDataURL('image/png')
    : thumbCanvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);
  return { base64, mediaType, thumbnailDataUrl };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const match = dataUrl.match(/^data:.*?;base64,(.*)$/);
      if (match) {
        resolve(match[1]);
      } else {
        reject(new Error('Failed to read encoded image'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}
