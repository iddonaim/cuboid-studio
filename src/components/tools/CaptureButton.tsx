import React, { useState } from 'react';
import { captureAndShare } from '../../lib/capture/screenshotCapture';

/**
 * Floating camera button overlaid on the viewport.
 * On mobile — opens the native share sheet (user can save to gallery).
 * On desktop — triggers a PNG download.
 */
export const CaptureButton: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);

  const handleCapture = async () => {
    if (busy) return;
    setBusy(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    try {
      await captureAndShare();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleCapture}
      disabled={busy}
      title="Screenshot / Save to Gallery"
      style={{
        position: 'absolute',
        bottom: 40,
        right: 12,
        zIndex: 10,
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: flash ? '#334155' : '#0f172a',
        border: '1px solid #334155',
        color: busy ? '#475569' : '#94a3b8',
        cursor: busy ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        transition: 'background 0.1s',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      }}
    >
      <i className={busy ? 'fas fa-spinner fa-spin' : 'fas fa-camera'} />
    </button>
  );
};
