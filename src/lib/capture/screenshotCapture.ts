/**
 * Screenshot Capture
 * ==================
 * Provides a single capture function ref that is registered by the inner
 * R3F canvas component (SceneCapture) and called from outside React.
 *
 * Usage:
 *   - SceneCapture (inside Canvas) calls registerCaptureFunction()
 *   - CaptureButton (outside Canvas) calls captureAndShare()
 */

export interface CaptureOptions {
  /** Multiplier over the on-screen buffer; clamped so GPUs stay happy. */
  scale?: number;
}

type CaptureFunction = (options?: CaptureOptions) => string;

let captureFunction: CaptureFunction | null = null;

export function registerCaptureFunction(fn: CaptureFunction): void {
  captureFunction = fn;
}

export function unregisterCaptureFunction(): void {
  captureFunction = null;
}

/**
 * Captures the current viewport as a PNG data URL.
 * Returns null if no canvas has registered a capture function yet.
 */
export function captureViewport(options?: CaptureOptions): string | null {
  if (!captureFunction) return null;
  return captureFunction(options);
}

/**
 * Captures the viewport and triggers a file download (desktop) or
 * opens the native share sheet with the image file (mobile).
 */
export async function captureAndShare(options?: CaptureOptions): Promise<void> {
  const dataURL = captureViewport(options);
  if (!dataURL) return;

  // Convert data URL → Blob
  const res = await fetch(dataURL);
  const blob = await res.blob();
  const filename = `cuboid-diagram-${Date.now()}.png`;
  const file = new File([blob], filename, { type: 'image/png' });

  // Mobile: Web Share API with file attachment → triggers native share sheet
  // (user can "Save to Photos" / "Save to Gallery" from there)
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Cuboid Assembly' });
      return;
    } catch (err) {
      // User cancelled share — fall through to download
      if ((err as Error).name === 'AbortError') return;
    }
  }

  // Desktop fallback: direct download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
