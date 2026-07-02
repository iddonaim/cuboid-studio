import React, { useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
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
      className={`absolute bottom-10 right-3 z-10 w-9 h-9 rounded-full border border-ink-200 flex items-center justify-center text-sm shadow-[0_2px_8px_rgba(35,33,24,0.18)] transition-colors duration-100 ${
        flash ? 'bg-ink-200' : 'bg-ink-100'
      } ${busy ? 'text-ink-400 cursor-default' : 'text-ink-600 cursor-pointer'}`}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
    </button>
  );
};
