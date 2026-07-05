import React from 'react';

const TOP_BAR = 42;

/**
 * Desktop-only right rail for model output ("results") cards — the encoding
 * reading, operator translation result, and selected-cube details dock here
 * instead of floating loose over the viewport. The rail itself is invisible;
 * cards bring their own chrome and appear/disappear with their content, so
 * an empty rail costs nothing and never blocks the 3D view (pointer events
 * pass through except on the cards themselves).
 */
export const Inspector: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="absolute right-0 z-30 flex flex-col gap-2.5 p-3 overflow-y-auto pointer-events-none"
    style={{ top: TOP_BAR, bottom: 0, width: 312 }}
  >
    {children}
  </div>
);
