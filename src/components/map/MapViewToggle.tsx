/**
 * Map tab view switch — Analysis (site-analysis iframe) vs My sites (saved
 * sites layer). Only rendered for signed-in users (the sites layer reads
 * Firestore).
 *
 * Desktop: `MapViewSegment` is embedded in the TopBar so nothing floats over
 * the embedded map-context app's own toolbar. Mobile: `MapViewToggle` floats
 * top-right (the mobile TopBar has no room for it).
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

/** Mobile-only floating wrapper. z must beat Leaflet's internal panes (tile
 *  200 … popup 700, controls 1000) — they share this stacking context when
 *  the sites map is shown. */
export const MapViewToggle: React.FC = () => (
  <div className="absolute top-2 right-2 z-[1100] shadow-lg rounded-md">
    <MapViewSegment />
  </div>
);
