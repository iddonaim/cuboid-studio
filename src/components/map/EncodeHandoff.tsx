/**
 * "Site analysis ready → Encode" handoff for the Map tab.
 *
 * The Map tab is an embedded third-party app (map-context) in an iframe, and
 * we deliberately don't reach into it. That makes anything we float on top of
 * it a cover over *its* controls — the map's own toolbar and buttons sit in
 * the same corners. So this handoff lives in Cuboid's own chrome instead:
 *
 *   Desktop — a button in the TopBar (see TopBar.tsx), next to the
 *             Analysis / My sites switch, which is there for the same reason.
 *   Mobile  — a slim strip between the TopBar and the map. It takes its own
 *             row in the flex column, so it pushes the map down rather than
 *             sitting over it.
 */
import React from 'react';
import { useAppStore } from '../../store/useAppStore';

/** Clear the flag and jump to Encode — shared by both presentations. */
function useGoToEncode(): () => void {
  const setActiveMode = useAppStore(s => s.setActiveMode);
  const setSiteAnalysisReady = useAppStore(s => s.setSiteAnalysisReady);
  return () => {
    setSiteAnalysisReady(false);
    setActiveMode('encoding');
  };
}

/** Desktop: compact button for the TopBar's right-hand cluster. */
export const EncodeHandoffButton: React.FC = () => {
  const goToEncode = useGoToEncode();
  return (
    <button
      onClick={goToEncode}
      title="Site analysis ready — continue to Encode"
      className="rounded-md bg-primary hover:bg-primary/85 text-white font-mono text-[11px] px-2.5 py-1 whitespace-nowrap border-0 cursor-pointer transition-colors"
    >
      Site ready → Encode
    </button>
  );
};

/** Mobile: full-width strip that sits above the map, never over it. */
export const EncodeHandoffBar: React.FC = () => {
  const goToEncode = useGoToEncode();
  return (
    <div
      className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-1.5"
      style={{
        background: 'hsl(var(--card))',
        borderBottom: '1px solid hsl(var(--border))',
      }}
    >
      <span className="text-[11px] text-ink-700 truncate">Site analysis ready</span>
      <button
        onClick={goToEncode}
        className="rounded-md bg-primary hover:bg-primary/85 text-white font-mono text-[11px] px-2.5 py-1 whitespace-nowrap border-0 cursor-pointer shrink-0"
      >
        Go to Encode
      </button>
    </div>
  );
};
