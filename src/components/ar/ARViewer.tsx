/**
 * AR Viewer — model-viewer Tier 1
 * =================================
 * Exports the current assembly as a GLB and presents it inside a
 * <model-viewer> web component.
 *
 * On Android  → "View in AR" opens Scene Viewer (ARCore)
 * On iOS 15+  → "View in AR" opens Quick Look  (ARKit, GLB supported)
 * On desktop  → 3D orbit view only (no AR button)
 *
 * Scale slider:
 *   GLTF convention is 1 unit = 1 m.  Our cubes are 42 units (42 mm).
 *   Default scale 0.01 → each cube appears ≈ 42 cm in AR (good model scale).
 *   Range 0.001 (4.2 cm/cube, 1:1 physical) → 0.05 (210 cm/cube, near-building).
 */

import React, { useEffect, useRef, useState } from 'react';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useMemeStore } from '../../store/useMemeStore';
import { createAssemblyGLBUrl } from '../../lib/export/glbExport';

// Teach TypeScript about the <model-viewer> custom element
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string;
        alt?: string;
        ar?: boolean | '';
        'ar-modes'?: string;
        'camera-controls'?: boolean | '';
        'shadow-intensity'?: string;
        'auto-rotate'?: boolean | '';
        scale?: string;
        style?: React.CSSProperties;
      };
    }
  }
}

interface ARViewerProps {
  onClose: () => void;
}

const SCALE_MIN = 0.001;
const SCALE_MAX = 0.05;
const SCALE_DEFAULT = 0.01;

export const ARViewer: React.FC<ARViewerProps> = ({ onClose }) => {
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const cubeGeometryOverrides = useMemeStore(s => s.cubeGeometryOverrides);

  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(SCALE_DEFAULT);

  const urlRef = useRef<string | null>(null);
  const viewerRef = useRef<HTMLElement | null>(null);

  // Build GLB on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    createAssemblyGLBUrl(placedCubes, cubeGeometryOverrides)
      .then(url => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        urlRef.current = url;
        setGlbUrl(url);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('[ARViewer] GLB export failed:', err);
        setError('Could not build 3D model: ' + String(err?.message ?? err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    };
  }, []); // intentionally no deps — snapshot at open time

  // Update model-viewer scale attribute via DOM (more reliable than JSX prop for web components)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const s = `${scale} ${scale} ${scale}`;
    viewer.setAttribute('scale', s);
  }, [scale]);

  // Cube size in cm at current scale (42 units × scale × 100 cm/m)
  const cubeSizeCm = (scale * 42 * 100).toFixed(1);

  return (
    <div className="fixed inset-0 z-[1000] bg-black/90 flex flex-col">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950 border-b border-slate-700 flex-shrink-0">
        <div>
          <span className="text-slate-400 text-[13px] font-semibold">AR View</span>
          <span className="text-slate-600 text-[10px] ml-2">
            {placedCubes.length} cube{placedCubes.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={onClose}
          className="bg-transparent border-0 text-slate-400 cursor-pointer text-base px-1.5 py-1"
        >
          <i className="fas fa-times" />
        </button>
      </div>

      {/* ── Viewer area ── */}
      <div className="flex-1 relative overflow-hidden">

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-slate-400 text-[13px]">
            <i className="fas fa-spinner fa-spin text-xl" />
            Building 3D model…
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-red-500 text-xs p-6 text-center">
            <div>
              <i className="fas fa-exclamation-triangle mb-2 block text-xl" />
              {error}
            </div>
          </div>
        )}

        {/* ── model-viewer: do not modify this element or any of its attributes ── */}
        {glbUrl && !loading && (
          <model-viewer
            ref={(el: HTMLElement | null) => { viewerRef.current = el; }}
            src={glbUrl}
            alt={`Cuboid assembly — ${placedCubes.length} cubes`}
            ar
            ar-modes="scene-viewer quick-look"
            camera-controls
            shadow-intensity="0.8"
            auto-rotate
            scale={`${scale} ${scale} ${scale}`}
            style={{ width: '100%', height: '100%', background: '#f1f5f9' }}
          />
        )}
      </div>

      {/* ── Footer: scale + hint ── */}
      <div className="px-3.5 py-2.5 bg-slate-950 border-t border-slate-700 flex-shrink-0">
        {/* Scale row */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-slate-400 text-[10px] whitespace-nowrap">Scale</span>
          <input
            type="range"
            min={SCALE_MIN}
            max={SCALE_MAX}
            step={0.001}
            value={scale}
            onChange={e => setScale(Number(e.target.value))}
            className="flex-1 accent-blue-400"
          />
          <span className="text-slate-500 text-[9px] whitespace-nowrap min-w-[64px] text-right">
            {cubeSizeCm}cm / cube
          </span>
        </div>

        {/* Platform hint */}
        <div className="text-slate-600 text-[9px] leading-relaxed">
          <i className="fab fa-android mr-1" />Android: tap AR icon → Scene Viewer
          {'  ·  '}
          <i className="fab fa-apple mr-1" />iOS 15+: tap AR icon → Quick Look
        </div>
      </div>
    </div>
  );
};
