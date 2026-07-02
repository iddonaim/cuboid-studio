import React from 'react';
import { useToastStore } from '../../store/useToastStore';

const VARIANT_STYLES: Record<string, React.CSSProperties> = {
  success: { borderColor: 'hsl(150 40% 40% / 0.5)', color: 'hsl(150 45% 26%)' },
  error: { borderColor: 'hsl(var(--destructive) / 0.5)', color: 'hsl(var(--destructive))' },
  info: { borderColor: 'hsl(var(--border))', color: 'hsl(45 6% 30%)' },
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
          style={{
            background: 'hsl(var(--card) / 0.97)',
            boxShadow: '0 6px 24px hsl(45 9% 13% / 0.12)',
            ...VARIANT_STYLES[t.variant],
          }}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
};
