import React from 'react';
import { useAppStore, AppMode } from '../../store/useAppStore';

export type SheetHeight = 'collapsed' | 'half' | 'full';

// ── SVG icons per spec ───────────────────────────────────────────────────────

/** Builder: 2×2 grid of squares */
const BuilderIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2"  y="2"  width="6" height="6" rx="0.8" />
    <rect x="10" y="2"  width="6" height="6" rx="0.8" />
    <rect x="2"  y="10" width="6" height="6" rx="0.8" />
    <rect x="10" y="10" width="6" height="6" rx="0.8" />
  </svg>
);

/** Pataphysical: circle + crosshair */
const PataphysicalIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <circle cx="9" cy="9" r="5" />
    <line x1="9" y1="1"    x2="9" y2="3.5"  />
    <line x1="9" y1="14.5" x2="9" y2="17"   />
    <line x1="1"    y1="9" x2="3.5"  y2="9" />
    <line x1="14.5" y1="9" x2="17"   y2="9" />
  </svg>
);

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

const MODES: { key: AppMode; label: string; Icon: React.FC }[] = [
  { key: 'builder',      label: 'Builder',      Icon: BuilderIcon },
  { key: 'pataphysical', label: 'Pataphysical',  Icon: PataphysicalIcon },
  { key: 'encoding',     label: 'Encoding',      Icon: EncodingIcon },
  { key: 'evolution',    label: 'Evolution',     Icon: EvolutionIcon },
];

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
      {MODES.map(({ key, label, Icon }) => {
        const active = key === activeMode;
        return (
          <button
            key={key}
            onClick={() => handlePress(key)}
            className="flex-1 flex flex-col items-center justify-center gap-[3px] bg-transparent border-none cursor-pointer transition-colors"
            style={{
              color:      active ? '#ffffff' : 'rgb(148 163 184)',
              fontWeight: active ? 600 : 400,
            }}
          >
            <Icon />
            <span style={{ fontSize: 9, lineHeight: 1 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
};
