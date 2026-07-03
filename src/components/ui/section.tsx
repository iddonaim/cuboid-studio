import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

const SECTION_KEY_PREFIX = 'cs-section:';

function loadOpen(id: string, defaultOpen: boolean): boolean {
  try {
    const stored = localStorage.getItem(SECTION_KEY_PREFIX + id);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    // localStorage unavailable — fall through
  }
  return defaultOpen;
}

function saveOpen(id: string, open: boolean): void {
  try { localStorage.setItem(SECTION_KEY_PREFIX + id, open ? '1' : '0'); } catch { /* ignore */ }
}

interface SectionProps {
  /** Stable id used to persist the open/closed state across sessions. */
  id: string;
  title: string;
  /** Open on first ever visit; afterwards the user's last choice wins. */
  defaultOpen?: boolean;
  /** Small hint rendered at the right edge of the header (e.g. a count). */
  badge?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Collapsible sidebar section with a drafting-style header rule.
 * Keeps the sidebar short: secondary tools live in sections that are
 * collapsed by default and remember whether the user opened them.
 */
export const Section: React.FC<SectionProps> = ({ id, title, defaultOpen = false, badge, children }) => {
  const [open, setOpen] = useState(() => loadOpen(id, defaultOpen));

  const toggle = () => {
    setOpen(prev => {
      saveOpen(id, !prev);
      return !prev;
    });
  };

  return (
    <div className="border-t border-ink-200 first:border-t-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 py-2 bg-transparent border-0 cursor-pointer text-left group"
      >
        <ChevronRight
          size={11}
          className={`text-ink-400 transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`}
        />
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-500 group-hover:text-ink-800 flex-1">
          {title}
        </span>
        {badge != null && (
          <span className="text-[10px] text-ink-400 font-mono">{badge}</span>
        )}
      </button>
      {open && <div className="pb-2.5">{children}</div>}
    </div>
  );
};
