import React from 'react';
import { useAppStore, AppMode, VISIBLE_NAV_SLOTS } from '../../store/useAppStore';
import { useBuilderStore } from '../../store/useBuilderStore';

const glassStyle: React.CSSProperties = {
  background: '#0f172a',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 8px 48px rgba(0, 0, 0, 0.4)',
};

// Inline SVG panel-toggle icon — two vertical regions suggesting a sidebar
const PanelIcon: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
  >
    <rect x="1" y="1" width="12" height="12" rx="1.5" />
    {open
      ? <line x1="5" y1="1" x2="5" y2="13" />
      : <line x1="9" y1="1" x2="9" y2="13" />}
  </svg>
);

interface TopBarProps {
  /** Pass false on mobile — hides mode tabs and panel toggle */
  showModeTabs?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({ showModeTabs = true }) => {
  const activeMode        = useAppStore(s => s.activeMode);
  const setActiveMode     = useAppStore(s => s.setActiveMode);
  const floatingPanelOpen = useAppStore(s => s.floatingPanelOpen);
  const togglePanel       = useAppStore(s => s.toggleFloatingPanel);
  const placedCubes       = useBuilderStore(s => s.placedCubes);

  return (
    <div
      className="fixed top-0 inset-x-0 z-50 grid h-[42px]"
      style={{
        gridTemplateColumns: '1fr auto 1fr',
        ...glassStyle,
      }}
    >
      {/* ── Left: logo ── */}
      <div className="flex items-center px-4">
        <span className="font-mono text-[13px] text-slate-300 select-none">CS</span>
      </div>

      {/* ── Center: mode tabs ──
          Renders from VISIBLE_NAV_SLOTS so positional order stays stable;
          Map/Decode reserve their slots in NAV_SLOTS but aren't rendered
          until they have a mounted component. */}
      <div className="flex h-full">
        {showModeTabs
          ? VISIBLE_NAV_SLOTS.map(slot => {
              const active = slot.key === activeMode;
              return (
                <button
                  key={slot.key}
                  onClick={() => setActiveMode(slot.key as AppMode)}
                  className={[
                    'h-full px-3 flex items-center font-mono text-[11px] transition-colors border-b-2 bg-transparent border-0 cursor-pointer',
                    active
                      ? 'text-white border-b-white'
                      : 'text-slate-400 border-b-transparent hover:text-slate-200',
                  ].join(' ')}
                  style={{ borderBottom: active ? '2px solid #fff' : '2px solid transparent' }}
                >
                  {slot.label}
                </button>
              );
            })
          : null}
      </div>

      {/* ── Right: cube count + panel toggle ── */}
      <div className="flex items-center justify-end gap-2 px-4">
        <span className="font-mono text-[11px] text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-full select-none">
          {placedCubes.length}
        </span>

        {showModeTabs && (
          <button
            onClick={togglePanel}
            className="text-slate-400 hover:text-slate-200 transition-colors bg-transparent border-none cursor-pointer p-1 flex items-center"
            title={floatingPanelOpen ? 'Hide panel' : 'Show panel'}
          >
            <PanelIcon open={floatingPanelOpen} />
          </button>
        )}
      </div>
    </div>
  );
};
