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
      className={`absolute bottom-10 right-3 z-10 w-9 h-9 rounded-full border border-slate-700 flex items-center justify-center text-sm shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-colors duration-100 ${
        flash ? 'bg-slate-700' : 'bg-slate-950'
      } ${busy ? 'text-slate-600 cursor-default' : 'text-slate-400 cursor-pointer'}`}
    >
      <i className={busy ? 'fas fa-spinner fa-spin' : 'fas fa-camera'} />
    </button>
  );
};
