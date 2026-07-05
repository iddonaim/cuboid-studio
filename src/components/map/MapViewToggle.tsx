/**
 * MapViewToggle — small floating pill switching the Map tab between the
 * site-analysis iframe ("Analysis") and the saved-sites layer ("My sites").
 * Only rendered for signed-in users (the sites layer reads Firestore).
 * Sits top-right so it clears the embedded app's back button (top-left).
 */
import React from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';

export type MapView = 'analyze' | 'sites';

const OPTIONS: Array<{ value: MapView; label: string }> = [
  { value: 'analyze', label: 'Analysis' },
  { value: 'sites', label: 'My sites' },
];

export const MapViewToggle: React.FC<{
  view: MapView;
  onChange: (view: MapView) => void;
}> = ({ view, onChange }) => {
  const isMobile = useIsMobile();
  // z must beat Leaflet's internal panes (tile 200 … popup 700, controls
  // 1000) — they share this stacking context when the sites map is shown.
  return (
    <div
      className={`absolute ${isMobile ? 'top-2 right-2' : 'top-[50px] right-3'} z-[1100] flex rounded-md overflow-hidden border border-slate-600 shadow-lg`}
      style={{ background: 'rgba(15, 23, 42, 0.92)' }}
    >
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={`px-3 py-1.5 text-[11px] cursor-pointer border-0 ${
            view === value
              ? 'bg-violet-900 text-violet-200 font-semibold'
              : 'bg-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
};
