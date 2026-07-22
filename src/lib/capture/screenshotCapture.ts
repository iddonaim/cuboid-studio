/**
 * Screenshot Capture
 * ==================
 * Provides a single capture function ref that is registered by the inner
 * R3F canvas component (SceneCapture) and called from outside React.
 *
 * Usage:
 *   - SceneCapture (inside Canvas) calls registerCaptureFunction()
 *   - CaptureButton (outside Canvas) calls captureAndShare()
 *
 * Every exported PNG is stamped with a provenance record (a `tEXt` metadata
 * chunk under the keyword "cuboid-provenance") so a diagram can always be
 * traced back to its viewpoint and composition: camera position + orbit
 * target, projection + zoom, active section-plane params, and the Firestore
 * path of the composition it was captured from (if one is active). The image
 * itself is unchanged; read the record with e.g. `exiftool capture.png`.
 */
import { embedPngText } from './pngMetadata';
import { useSectionCutStore } from '../../store/useSectionCutStore';
import { useProjectsStore } from '../../store/useProjectsStore';

export interface CaptureOptions {
  /** Multiplier over the on-screen buffer; clamped so GPUs stay happy. */
  scale?: number;
}

/** Camera state at the moment of capture, reported by the R3F scene. */
export interface CaptureCameraState {
  projection: 'perspective' | 'orthographic';
  position: [number, number, number];
  /** OrbitControls target; null if controls weren't mounted. */
  target: [number, number, number] | null;
  zoom: number;
}

export interface CaptureResult {
  dataURL: string;
  camera: CaptureCameraState | null;
}

type CaptureFunction = (options?: CaptureOptions) => CaptureResult;

let captureFunction: CaptureFunction | null = null;

export function registerCaptureFunction(fn: CaptureFunction): void {
  captureFunction = fn;
}

export function unregisterCaptureFunction(): void {
  captureFunction = null;
}

/**
 * Captures the current viewport as a PNG data URL plus camera state.
 * Returns null if no canvas has registered a capture function yet.
 */
export function captureViewport(options?: CaptureOptions): CaptureResult | null {
  if (!captureFunction) return null;
  return captureFunction(options);
}

/** The provenance record embedded into each captured PNG. */
interface CaptureProvenance {
  app: 'cuboid-studio';
  capturedAt: string;
  camera: CaptureCameraState | null;
  sectionCut: { enabled: boolean; axis: 'x' | 'y' | 'z'; position: number };
  /** Firestore path of the active composition, or null when uncommitted. */
  composition: { projectId: string; siteId: string; compositionId: string; name: string } | null;
}

function buildProvenance(camera: CaptureCameraState | null): CaptureProvenance {
  const section = useSectionCutStore.getState();
  const projects = useProjectsStore.getState();
  const comp = projects.activeComposition;
  return {
    app: 'cuboid-studio',
    capturedAt: new Date().toISOString(),
    camera,
    sectionCut: { enabled: section.enabled, axis: section.axis, position: section.position },
    composition:
      comp && projects.activeProject && projects.activeSite
        ? {
            projectId: projects.activeProject.id,
            siteId: projects.activeSite.id,
            compositionId: comp.id,
            name: comp.name,
          }
        : null,
  };
}

/**
 * Captures the viewport, stamps provenance metadata into the PNG, and
 * triggers a file download (desktop) or opens the native share sheet with
 * the image file (mobile).
 */
export async function captureAndShare(options?: CaptureOptions): Promise<void> {
  const captured = captureViewport(options);
  if (!captured) return;

  // Convert data URL → bytes, then stamp the provenance tEXt chunk. Stamping
  // is best-effort: a malformed buffer passes through unmodified rather than
  // ever losing a capture.
  const res = await fetch(captured.dataURL);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const provenance = buildProvenance(captured.camera);
  const stamped = embedPngText(bytes, 'cuboid-provenance', JSON.stringify(provenance));

  // Composition id in the filename for at-a-glance sorting; the full record
  // lives in the metadata.
  const compTag = provenance.composition ? `${provenance.composition.compositionId}-` : '';
  const filename = `cuboid-diagram-${compTag}${Date.now()}.png`;

  const blob = new Blob([stamped.buffer as ArrayBuffer], { type: 'image/png' });
  const file = new File([blob], filename, { type: 'image/png' });

  // Mobile only: Web Share API with file attachment → native share sheet
  // (user can "Save to Photos" / "Save to Gallery" from there).
  // Desktop Safari also implements canShare, but its share sheet has no
  // save-to-disk option (only Copy/AirDrop), so gate on a coarse pointer
  // to keep desktops on the plain download path.
  const isTouchDevice = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  if (isTouchDevice && navigator.canShare?.({ files: [file] })) {
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
