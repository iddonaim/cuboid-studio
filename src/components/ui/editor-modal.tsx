/**
 * EditorModal — centered popup shell for the long authoring forms (lexicon /
 * translation-vocabulary editors). Follows the app's established modal
 * pattern (SiteContextCurator / ArchthesisBrowser): dark backdrop, centered
 * card, its own scroll area — so big forms don't stretch the sidebar.
 *
 * Closes on backdrop click and Escape. Rendered in place (no portal) so
 * component tests keep seeing the form in the same tree.
 */
import React, { useEffect } from 'react';

export function EditorModal({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000]"
      onClick={onClose}
    >
      <div
        className="bg-ink-100 rounded-xl border border-ink-200 w-[90vw] max-w-[560px] max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-ink-200 shrink-0">
          <div>
            {subtitle && (
              <div className="text-[10px] text-ink-500 tracking-[0.1em] uppercase">
                {subtitle}
              </div>
            )}
            <h2 className="text-ink-900 text-sm font-semibold">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-transparent border-0 text-ink-600 hover:text-ink-900 text-2xl cursor-pointer leading-none"
          >
            &times;
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
}
