/**
 * Resize a photo for the encode API: longest edge capped at maxDimension,
 * no upscaling, JPEG 0.88 or PNG output.
 */
export async function resizeImageToBase64(
  file: File,
  maxDimension = 1600
): Promise<{ base64: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file);

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
  if (!ctx) {
    bitmap.close();
    throw new Error('Could not get canvas context');
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
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
  return { base64, mediaType };
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
