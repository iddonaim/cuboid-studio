import React from 'react';
import { useAppStore, AppMode, VISIBLE_NAV_SLOTS } from '../../store/useAppStore';
import { useBuilderStore } from '../../store/useBuilderStore';
import { AuthControls } from '../auth/AuthControls';
import { SaveCompositionButton } from '../projects/SaveCompositionButton';

const glassStyle: React.CSSProperties = {
  background: 'hsl(var(--card) / 0.94)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  borderBottom: '1px solid hsl(var(--border))',
  boxShadow: '0 1px 12px hsl(45 9% 13% / 0.05)',
  // Promote to its own compositing layer. The sibling viewport wrapper is
  // GPU-promoted (translateZ(0) in App.tsx); without matching promotion here
  // the map iframe repaints over the bar on click/scroll.
  transform: 'translateZ(0)',
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
  const openOnboarding    = useAppStore(s => s.openOnboarding);
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
        <span className="font-mono text-[13px] font-semibold tracking-tight text-ink-900 select-none">
          Cuboid<span className="text-primary">·</span>Studio
        </span>
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
                    'h-full px-3 flex items-center font-mono text-[12px] uppercase tracking-wider transition-colors bg-transparent border-0 cursor-pointer',
                    active
                      ? 'text-ink-900 font-semibold'
                      : 'text-ink-500 hover:text-ink-800',
                  ].join(' ')}
                  style={{
                    borderBottom: active
                      ? '2px solid hsl(var(--primary))'
                      : '2px solid transparent',
                  }}
                >
                  {slot.label}
                </button>
              );
            })
          : null}
      </div>

      {/* ── Right: save + account/projects + cube count + help + panel toggle ── */}
      <div className="flex items-center justify-end gap-2 px-4">
        <SaveCompositionButton />
        <AuthControls />

        <button
          onClick={openOnboarding}
          title="Show introduction"
          aria-label="Show introduction"
          className="font-mono text-[12px] text-ink-500 hover:text-ink-800 transition-colors bg-transparent border-none cursor-pointer px-1"
        >
          ?
        </button>

        <span
          className="font-mono text-[12px] text-ink-600 bg-ink-100 border border-ink-200 px-2 py-0.5 rounded-full select-none"
          title="Cubes in assembly"
        >
          {placedCubes.length}
        </span>

        {showModeTabs && (
          <button
            onClick={togglePanel}
            className="text-ink-500 hover:text-ink-800 transition-colors bg-transparent border-none cursor-pointer p-1 flex items-center"
            title={floatingPanelOpen ? 'Hide panel' : 'Show panel'}
          >
            <PanelIcon open={floatingPanelOpen} />
          </button>
        )}
      </div>
    </div>
  );
};
