/**
 * Mobile-only Cuboid chrome for the Map tab.
 *
 * The mobile TopBar has no room for map controls, so they used to float over
 * the map — the Analysis / My sites switch pinned to its top-right corner, the
 * Encode handoff as a card at the bottom-right. Both sat on top of the
 * embedded map-context app's own UI (which we don't touch).
 *
 * This strip gives them a home in Cuboid's chrome instead. It is a sibling row
 * in the mobile flex column, above the viewport wrapper, so it *pushes the map
 * down* — it occupies its own space rather than covering anything. Desktop
 * puts the same two controls in the TopBar.
 *
 * Renders nothing when there is nothing to show, so the map keeps its full
 * height in the common case (signed out, no analysis yet).
 */
import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useAuthContext } from '../../contexts/AuthContext';
import { isDemoMode } from '../../lib/demo/demoMode';
import { MapViewSegment } from './MapViewToggle';
import { EncodeHandoffButton } from './EncodeHandoff';

export const MapChromeBar: React.FC = () => {
  const siteAnalysisReady = useAppStore(s => s.siteAnalysisReady);
  const { user } = useAuthContext();

  // Same condition App.tsx uses to decide whether "My sites" is reachable.
  const showViewSwitch = !!user || isDemoMode();
  if (!showViewSwitch && !siteAnalysisReady) return null;

  return (
    <div
      className="flex-shrink-0 flex items-center justify-between gap-2 py-1.5"
      style={{
        background: 'hsl(var(--card))',
        borderBottom: '1px solid hsl(var(--border))',
        // Match the TopBar's safe-area handling so the controls clear a
        // landscape display cutout.
        paddingLeft: 'calc(0.75rem + env(safe-area-inset-left, 0px))',
        paddingRight: 'calc(0.75rem + env(safe-area-inset-right, 0px))',
      }}
    >
      {showViewSwitch ? (
        <MapViewSegment />
      ) : (
        <span className="text-[11px] text-ink-700 truncate">Site analysis ready</span>
      )}
      {siteAnalysisReady && <EncodeHandoffButton label="Go to Encode" />}
    </div>
  );
};
