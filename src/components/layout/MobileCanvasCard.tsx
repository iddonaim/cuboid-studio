import React, { useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

interface MobileCanvasCardProps {
  /** Chip text, and the drawer's title once opened. */
  label: string;
  /** Short subtitle — e.g. "v-63 · 1 change". Truncated on the chip. */
  detail?: string;
  /** Renders a ×, which closes the underlying card and not just the drawer. */
  onDismiss?: () => void;
  /** false → a static status pill with nothing to open (e.g. "Encoding space…"). */
  expandable?: boolean;
  children?: React.ReactNode;
}

const surface: React.CSSProperties = {
  background: 'hsl(var(--card) / 0.95)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
};

/**
 * Phone treatment for the cards that report a model's output on the canvas —
 * the encode reading, the latest translation, a cube's change history.
 *
 * These are the desktop Inspector rail's cards, and the rail is a fixed 260–280px
 * column. Floated over a 390px-wide phone at that same size they cover two
 * thirds of the width and well over half the height of the thing they describe,
 * and the encode reading in particular had no way to be dismissed at all.
 *
 * So on the phone the card is a chip until asked for: label (+ a short detail)
 * in the top-right corner, and tapping it opens the full content as a drawer
 * capped at 42% of the visible viewport. The drawer opens downward from where
 * the chip sits rather than up from the bottom edge, which keeps it clear of
 * every other piece of canvas chrome — the help pill, the API activity pill,
 * and the ortho/capture column are all anchored to the bottom.
 *
 * Desktop is untouched: there the same panels render their `docked` variant
 * into the Inspector, and never mount this.
 */
export const MobileCanvasCard: React.FC<MobileCanvasCardProps> = ({
  label,
  detail,
  onDismiss,
  expandable = true,
  children,
}) => {
  const [open, setOpen] = useState(false);

  if (!open) {
    const chipCls =
      'absolute top-3 right-3 z-20 flex max-w-[64%] items-center gap-1.5 rounded-full border border-ink-200 py-1.5 pl-3 pr-2.5 text-[12px] text-ink-700 shadow-[0_2px_12px_hsl(45_9%_13%/0.10)]';

    if (!expandable) {
      return (
        <div className={chipCls} style={surface} role="status" aria-live="polite">
          <span className="truncate">{label}</span>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        title={detail ? `${label} — ${detail}` : label}
        className={`${chipCls} cursor-pointer`}
        style={surface}
      >
        <span className="truncate font-medium">{label}</span>
        {detail && <span className="truncate text-ink-500">{detail}</span>}
        <ChevronDown size={13} className="flex-shrink-0 text-ink-400" />
      </button>
    );
  }

  return (
    <div
      className="absolute inset-x-2 top-3 z-30 flex max-h-[calc(var(--app-vh)*0.42)] flex-col overflow-hidden rounded-xl border border-ink-200 shadow-[0_6px_28px_hsl(45_9%_13%/0.16)]"
      style={surface}
    >
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-ink-200 px-3 py-2">
        <div className="min-w-0">
          <p className="m-0 truncate text-[13px] font-semibold text-ink-900">{label}</p>
          {detail && <p className="m-0 truncate text-[11px] text-ink-500">{detail}</p>}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {onDismiss && (
            <button
              type="button"
              onClick={() => { setOpen(false); onDismiss(); }}
              title="Close"
              aria-label="Close"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-400 hover:text-ink-700"
            >
              <X size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            title="Collapse"
            aria-label="Collapse"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-500 hover:text-ink-800"
          >
            <ChevronUp size={17} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {children}
      </div>
    </div>
  );
};
