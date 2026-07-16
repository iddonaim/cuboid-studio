/**
 * SettingsPopover — the gear in the top bar.
 *
 * Two things live here for now:
 *  1. Accent color — a full-RGB picker (native OS color input) plus a few
 *     one-tap presets and a reset. Recolors the whole UI and the 3D preview
 *     live; exported drawings stay the canonical vermilion.
 *  2. About — app blurb + a short privacy note.
 *
 * Self-contained popover (no popover dependency): a positioned panel with
 * click-outside and Escape to close.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useAccent } from '../../contexts/AccentContext';
import { ACCENT_PRESETS, CANONICAL_ACCENT } from '../../lib/theme/accent';

const GearIcon: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const SettingsPopover: React.FC = () => {
  const { accent, setAccent, resetAccent } = useAccent();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Settings"
        aria-label="Settings"
        aria-expanded={open}
        className="text-ink-500 hover:text-ink-800 transition-colors bg-transparent border-none cursor-pointer p-1 flex items-center"
      >
        <GearIcon />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Settings"
          className="absolute right-0 top-full mt-2 w-64 rounded-md border border-ink-200 bg-card shadow-lg p-3 z-50"
          style={{ boxShadow: '0 6px 24px hsl(45 9% 13% / 0.12)' }}
        >
          {/* ── Accent color ── */}
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-500 mb-2">
            Accent color
          </div>

          <div className="flex items-center gap-2 mb-2">
            <label className="relative w-8 h-8 rounded-md border border-ink-200 overflow-hidden cursor-pointer shrink-0" title="Pick any color">
              <span className="absolute inset-0" style={{ background: accent }} />
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label="Pick accent color"
              />
            </label>
            <span className="font-mono text-[12px] text-ink-600 uppercase">{accent}</span>
            {accent.toLowerCase() !== CANONICAL_ACCENT && (
              <button
                onClick={resetAccent}
                className="ml-auto font-mono text-[11px] text-ink-500 hover:text-primary bg-transparent border-none cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 mb-3">
            {ACCENT_PRESETS.map((p) => {
              const active = p.hex.toLowerCase() === accent.toLowerCase();
              return (
                <button
                  key={p.hex}
                  onClick={() => setAccent(p.hex)}
                  title={p.name}
                  aria-label={p.name}
                  className="w-6 h-6 rounded-full border cursor-pointer transition-transform hover:scale-110"
                  style={{
                    background: p.hex,
                    borderColor: active ? 'hsl(var(--foreground))' : 'hsl(var(--border))',
                    outline: active ? '2px solid hsl(var(--foreground))' : 'none',
                    outlineOffset: 1,
                  }}
                />
              );
            })}
          </div>

          <div className="h-px bg-ink-200 -mx-3 mb-2" />

          {/* ── About ── */}
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-500 mb-1.5">
            About
          </div>
          <p className="text-[12px] leading-relaxed text-ink-600">
            <span className="font-semibold text-ink-800">Cuboid Studio</span> — a
            B.Arch thesis by Iddo Naim. Maps a site, reads a space, lets culture
            act, and draws the result.
          </p>
          <p className="text-[11px] leading-relaxed text-ink-500 mt-1.5">
            Your accent color is saved only in this browser. Site analysis sends
            the address, photos and prompts you provide to third-party mapping
            and AI services to generate results.
          </p>
        </div>
      )}
    </div>
  );
};
