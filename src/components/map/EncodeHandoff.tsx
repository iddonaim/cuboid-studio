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
 *   Mobile  — in the MapChromeBar strip above the map (see MapChromeBar.tsx).
 */
import React from 'react';
import { useAppStore } from '../../store/useAppStore';

interface EncodeHandoffButtonProps {
  /** Desktop sits in a crowded bar and wants the short form. */
  label?: string;
}

export const EncodeHandoffButton: React.FC<EncodeHandoffButtonProps> = ({
  label = 'Site ready → Encode',
}) => {
  const setActiveMode = useAppStore(s => s.setActiveMode);
  const setSiteAnalysisReady = useAppStore(s => s.setSiteAnalysisReady);
  return (
    <button
      onClick={() => {
        setSiteAnalysisReady(false);
        setActiveMode('encoding');
      }}
      title="Site analysis ready — continue to Encode"
      className="rounded-md bg-primary hover:bg-primary/85 text-white font-mono text-[11px] px-2.5 py-1 whitespace-nowrap border-0 cursor-pointer transition-colors shrink-0"
    >
      {label}
    </button>
  );
};
