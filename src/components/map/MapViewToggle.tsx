/**
 * Map tab view switch — Analysis (site-analysis iframe) vs My sites (saved
 * sites layer). Only rendered for signed-in users (the sites layer reads
 * Firestore).
 *
 * Never floats over the map: the Map tab is an embedded third-party app and
 * anything on top of it covers that app's own controls. Desktop embeds this in
 * the TopBar; mobile puts it in the MapChromeBar strip above the map.
 */
import React from 'react';
import { useAppStore, MapView } from '../../store/useAppStore';

export type { MapView };

const OPTIONS: Array<{ value: MapView; label: string }> = [
  { value: 'analyze', label: 'Analysis' },
  { value: 'sites', label: 'My sites' },
];

/** Bare segmented control, styled for the light TopBar / app chrome. */
export const MapViewSegment: React.FC = () => {
  const view = useAppStore(s => s.mapView);
  const setView = useAppStore(s => s.setMapView);
  return (
    <div className="flex rounded-md overflow-hidden border border-ink-200 bg-ink-100">
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setView(value)}
          className={`px-2.5 py-1 text-[11px] font-mono cursor-pointer border-0 transition-colors ${
            view === value
              ? 'bg-primary/10 text-primary font-semibold'
              : 'bg-transparent text-ink-500 hover:text-ink-800'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
};
