/**
 * How much of an assembly is actually connected.
 *
 * Reads in cutter terms — sphere, cylinder, shell — because that is what the
 * rule reads. The door/window/wall gloss is an interpretation laid on top of
 * the geometry, and the grammar's own anti-literalism rule warns against
 * exactly that mapping, so it has no place here.
 *
 * Two closed conditions, and only one of them is worth marking:
 *
 * - **shell** — a face the model records as uncut. ⚠ Over-reported: the face
 *   model under-counts cuts (see connectionViolations.ts), so shell contacts
 *   read as far more common than the geometry warrants. Counted, not marked.
 * - **crossed** — a sphere face meets a cylinder face. Two cutters that
 *   genuinely disagree. Those cubes are tinted amber.
 *
 * Nothing here repairs anything, and nothing offers to.
 */

import React, { useState } from 'react';
import {
  CheckableCube,
  summarizeConnections,
  violationsSignature,
} from '../../lib/cube/connectionViolations';

const AXIS_LABEL: Record<'x' | 'y' | 'z', string> = {
  x: 'across',
  y: 'stacked',
  z: 'depth',
};

interface ConnectionReadingProps {
  cubes: CheckableCube[];
}

export const ConnectionReading: React.FC<ConnectionReadingProps> = ({ cubes }) => {
  const summary = React.useMemo(() => summarizeConnections(cubes), [cubes]);
  const { violations, totalAdjacencies, shell, crossed, crossedCubeIds } = summary;
  const signature = violationsSignature(violations);
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (totalAdjacencies === 0) return null;
  if (dismissedSignature === signature) return null;

  const open = totalAdjacencies - violations.length;

  return (
    <div className="border border-ink-200 bg-ink-50/80 rounded-md px-2.5 py-1.5 text-[11px] text-ink-500">
      <div className="flex items-baseline gap-2">
        <span className="text-ink-700">
          {open}/{totalAdjacencies} contacts open
        </span>
        <span className="flex-1 text-ink-400">
          {shell > 0 && `${shell} shell`}
          {shell > 0 && crossed > 0 && ' · '}
          {crossed > 0 && `${crossed} crossed (${crossedCubeIds.size} marked)`}
        </span>
        <button
          type="button"
          onClick={() => setDismissedSignature(signature)}
          className="text-ink-400 hover:text-ink-600 leading-none"
          aria-label="Dismiss connection reading"
        >
          ×
        </button>
      </div>

      {violations.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-ink-400 hover:text-ink-600 underline underline-offset-2"
          >
            {expanded ? 'Hide' : 'Which?'}
          </button>

          {expanded && (
            <>
              <ul className="mt-1 space-y-0.5 font-mono text-[10px] text-ink-500">
                {violations.map(v => (
                  <li key={v.key}>
                    {v.a.variationId} {v.a.cutType} ↔ {v.b.cutType} {v.b.variationId} ·{' '}
                    {AXIS_LABEL[v.axis]}
                  </li>
                ))}
              </ul>
              <div className="mt-1 text-ink-400 text-[10px]">
                Variation faces as built; later meme cuts aren't tracked. No depth face
                carries a cutter, so depth contacts close unless a cube is tipped.
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
