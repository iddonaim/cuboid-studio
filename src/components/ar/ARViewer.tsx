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
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: '#0f172a',
          borderBottom: '1px solid #334155',
          flexShrink: 0,
        }}
      >
        <div>
          <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>AR View</span>
          <span style={{ color: '#475569', fontSize: 10, marginLeft: 8 }}>
            {placedCubes.length} cube{placedCubes.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 16,
            padding: '4px 6px',
          }}
        >
          <i className="fas fa-times" />
        </button>
      </div>

      {/* ── Viewer area ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

        {loading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10,
            color: '#94a3b8', fontSize: 13,
          }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: 20 }} />
            Building 3D model…
          </div>
        )}

        {error && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#ef4444', fontSize: 12, padding: 24, textAlign: 'center',
          }}>
            <div>
              <i className="fas fa-exclamation-triangle" style={{ marginBottom: 8, display: 'block', fontSize: 20 }} />
              {error}
            </div>
          </div>
        )}

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
      <div
        style={{
          padding: '10px 14px',
          background: '#0f172a',
          borderTop: '1px solid #334155',
          flexShrink: 0,
        }}
      >
        {/* Scale row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ color: '#94a3b8', fontSize: 10, whiteSpace: 'nowrap' }}>
            Scale
          </span>
          <input
            type="range"
            min={SCALE_MIN}
            max={SCALE_MAX}
            step={0.001}
            value={scale}
            onChange={e => setScale(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#60a5fa' }}
          />
          <span
            style={{
              color: '#64748b',
              fontSize: 9,
              whiteSpace: 'nowrap',
              minWidth: 64,
              textAlign: 'right',
            }}
          >
            {cubeSizeCm}cm / cube
          </span>
        </div>

        {/* Platform hint */}
        <div style={{ color: '#475569', fontSize: 9, lineHeight: 1.5 }}>
          <i className="fab fa-android" style={{ marginRight: 4 }} />Android: tap AR icon → Scene Viewer
          {'  ·  '}
          <i className="fab fa-apple" style={{ marginRight: 4 }} />iOS 15+: tap AR icon → Quick Look
        </div>
      </div>
    </div>
  );
};
