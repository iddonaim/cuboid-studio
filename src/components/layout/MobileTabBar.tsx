import React from 'react';
import { useAppStore, AppMode, VISIBLE_NAV_SLOTS, NavSlot } from '../../store/useAppStore';

export type SheetHeight = 'collapsed' | 'half' | 'full';

// ── SVG icons per spec ───────────────────────────────────────────────────────

/** Encoding: 3 horizontal lines */
const EncodingIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <line x1="2" y1="5"  x2="16" y2="5"  />
    <line x1="2" y1="9"  x2="16" y2="9"  />
    <line x1="2" y1="13" x2="16" y2="13" />
  </svg>
);

/** Evolution: two curved arrows (cycle / refresh) */
const EvolutionIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    {/* Top arc, CW */}
    <path d="M3.5 9 A5.5 5.5 0 0 1 14.5 9" />
    <polyline points="14.5,6.5 14.5,9 12,9" />
    {/* Bottom arc, CW */}
    <path d="M14.5 9 A5.5 5.5 0 0 1 3.5 9" />
    <polyline points="3.5,11.5 3.5,9 6,9" />
  </svg>
);

/** Map (reserved): pinned location glyph */
const MapIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 16 C 9 16 14 11 14 7 A 5 5 0 0 0 4 7 C 4 11 9 16 9 16 Z" />
    <circle cx="9" cy="7" r="1.6" />
  </svg>
);

/** Decode (reserved): notation lines */
const DecodeIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <line x1="2" y1="6"  x2="16" y2="6"  />
    <line x1="2" y1="12" x2="11" y2="12" />
    <line x1="2" y1="9"  x2="14" y2="9"  />
  </svg>
);

/**
 * Icon registry keyed by slot.key. New slots (Map, Decode) add their icon
 * here when they get mounted — paired with NAV_SLOTS by key, not by index.
 */
const SLOT_ICONS: Record<NavSlot['key'], React.FC> = {
  map:       MapIcon,
  encoding:  EncodingIcon,
  evolution: EvolutionIcon,
  decode:    DecodeIcon,
};

interface MobileTabBarProps {
  heightState: SheetHeight;
  /** Called when a tab is pressed and the sheet is currently collapsed */
  onExpandToHalf: () => void;
}

export const MobileTabBar: React.FC<MobileTabBarProps> = ({ heightState, onExpandToHalf }) => {
  const activeMode    = useAppStore(s => s.activeMode);
  const setActiveMode = useAppStore(s => s.setActiveMode);

  const handlePress = (mode: AppMode) => {
    setActiveMode(mode);
    if (heightState === 'collapsed') onExpandToHalf();
  };

  return (
    <div
      className="flex w-full flex-shrink-0"
      style={{
        height: 'calc(56px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {VISIBLE_NAV_SLOTS.map((slot) => {
        const Icon = SLOT_ICONS[slot.key];
        const active = slot.key === activeMode;
        return (
          <button
            key={slot.key}
            onClick={() => handlePress(slot.key as AppMode)}
            className="flex-1 flex flex-col items-center justify-center gap-[3px] bg-transparent border-none cursor-pointer transition-colors"
            style={{
              color:      active ? '#ffffff' : 'rgb(148 163 184)',
              fontWeight: active ? 600 : 400,
            }}
          >
            <Icon />
            <span style={{ fontSize: 9, lineHeight: 1 }}>{slot.label}</span>
          </button>
        );
      })}
    </div>
  );
};
