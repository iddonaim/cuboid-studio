import React from 'react';
import { useToastStore } from '../../store/useToastStore';

const VARIANT_STYLES: Record<string, React.CSSProperties> = {
  success: { borderColor: 'rgba(16, 185, 129, 0.5)', color: '#6ee7b7' },
  error: { borderColor: 'rgba(239, 68, 68, 0.5)', color: '#fca5a5' },
  info: { borderColor: 'rgba(148, 163, 184, 0.4)', color: '#cbd5e1' },
};

/** Fixed bottom-center stack of auto-dismissing toasts. */
export const ToastContainer: React.FC = () => {
  const toasts = useToastStore(s => s.toasts);
  const dismiss = useToastStore(s => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map(t => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className="pointer-events-auto rounded-md border px-3.5 py-2 text-[12px] font-mono shadow-xl cursor-pointer"
          style={{ background: 'rgba(15, 23, 42, 0.96)', ...VARIANT_STYLES[t.variant] }}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
};
