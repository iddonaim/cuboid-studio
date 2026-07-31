import React, { useEffect, useState } from 'react';
import { getFileUrl, fetchFileBlob } from '../../lib/projects/photoStorage';
import { importPlanUnderlay } from '../../lib/decode/planUnderlay';
import { useDecodeStore } from '../../store/useDecodeStore';
import { useAppStore } from '../../store/useAppStore';
import { useToastStore } from '../../store/useToastStore';
import type { CaptureRecord } from '../../lib/projects/types';

function fmtWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** The view a capture was taken from, as one readable line. */
export function captureMeta(capture: CaptureRecord): string {
  const projection = capture.projection === 'orthographic' ? 'ortho' : 'perspective';
  if (!capture.section) return `${projection} · no section`;
  const { axis, position, flipped } = capture.section;
  return `${projection} · section ${axis.toUpperCase()} ${Math.round(position)}${flipped ? ' ⇄' : ''}`;
}

/**
 * Full-size viewer for a saved capture — the room the 340px panel row doesn't
 * have. Arrow keys walk the set; the image is streamed from Storage rather
 * than carried in the composition document.
 */
export const CaptureGallery: React.FC<{
  captures: CaptureRecord[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}> = ({ captures, index, onIndexChange, onClose }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const setUnderlay = useDecodeStore(s => s.setUnderlay);
  const setActiveMode = useAppStore(s => s.setActiveMode);
  const showToast = useToastStore(s => s.showToast);

  const capture = captures[index];

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    if (!capture) return;
    getFileUrl(capture.storagePath).then(resolved => {
      if (cancelled) return;
      if (resolved) setUrl(resolved);
      else setFailed(true);
    });
    return () => { cancelled = true; };
  }, [capture]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < captures.length - 1) onIndexChange(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, captures.length, onIndexChange, onClose]);

  if (!capture) return null;

  // Send to Decode as a locked underlay — the same path an imported plan takes,
  // so registration and persistence behave identically.
  const handleUseInDecode = async () => {
    setSending(true);
    try {
      const blob = await fetchFileBlob(capture.storagePath);
      if (!blob) {
        showToast('Could not load that capture', 'error');
        return;
      }
      const file = new File([blob], `capture-${capture.id}.png`, { type: 'image/png' });
      setUnderlay(await importPlanUnderlay(file));
      setActiveMode('decode');
      onClose();
      showToast('Capture set as the Decode underlay', 'success');
    } catch (err) {
      console.error('Use in Decode failed:', err);
      showToast('Could not use that capture', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleDownload = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `cuboid-capture-${capture.id}.png`;
    a.target = '_blank';
    a.click();
  };

  return (
    <>
      <div className="fixed inset-0 z-[95] bg-black/60" onClick={onClose} />
      <div className="fixed z-[96] inset-6 md:inset-12 flex flex-col rounded-lg border border-ink-200 bg-card shadow-[0_16px_50px_rgba(35,33,24,0.28)] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-ink-200">
          <div className="min-w-0">
            <div className="text-[12px] text-ink-800">{fmtWhen(capture.createdAt)}</div>
            <div className="font-mono text-[10px] text-ink-500">{captureMeta(capture)}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-ink-400 tabular-nums">
              {index + 1}/{captures.length}
            </span>
            <button
              onClick={() => void handleUseInDecode()}
              disabled={sending}
              className="rounded border border-primary/35 bg-primary/[0.06] text-primary text-[11px] px-2 py-1 cursor-pointer disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Use in Decode'}
            </button>
            <button
              onClick={handleDownload}
              disabled={!url}
              className="rounded border border-ink-200 bg-transparent hover:bg-ink-100 text-ink-600 text-[11px] px-2 py-1 cursor-pointer disabled:opacity-40"
            >
              Download
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-ink-500 hover:text-ink-800 text-[14px] leading-none bg-transparent border-0 cursor-pointer px-1"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex items-center justify-center bg-ink-50 p-4 relative">
          {index > 0 && (
            <button
              onClick={() => onIndexChange(index - 1)}
              aria-label="Previous capture"
              className="absolute left-2 w-8 h-8 rounded-full border border-ink-200 bg-card text-ink-600 cursor-pointer"
            >
              ‹
            </button>
          )}
          {failed ? (
            <p className="text-[12px] text-ink-500 m-0">
              That capture couldn’t be loaded — it may have been removed from storage.
            </p>
          ) : url ? (
            <img
              src={url}
              alt={`Capture from ${fmtWhen(capture.createdAt)}`}
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            // Something to look at while the full-size image streams in.
            <img
              src={capture.thumbnailDataUrl}
              alt=""
              className="max-w-full max-h-full object-contain opacity-50 blur-[1px]"
            />
          )}
          {index < captures.length - 1 && (
            <button
              onClick={() => onIndexChange(index + 1)}
              aria-label="Next capture"
              className="absolute right-2 w-8 h-8 rounded-full border border-ink-200 bg-card text-ink-600 cursor-pointer"
            >
              ›
            </button>
          )}
        </div>
      </div>
    </>
  );
};
