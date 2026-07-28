/**
 * How much of an assembly is actually connected.
 *
 * This started as a violation count and was wrong in its framing. Reporting
 * "21 of 34 adjacencies violate the connection law" made an assembly look
 * broken 21 times, when almost all of those were the vocabulary doing exactly
 * what it does: no variation carries a cut on either depth face, so any two
 * cubes stacked front-to-back close against each other unless one is tipped.
 * That is closure, not a fault, and calling it a violation misdescribes both
 * the system and the composition.
 *
 * So the reading leads with what connects, and separates the two conditions:
 *
 * - **Closed** — met a blank wall. A property of the composition. Not marked in
 *   the viewport; on a three-dimensional assembly this is most of the cubes,
 *   and marking them says nothing an architect can act on.
 * - **Crossed** — a door against a window. The one case where a proposal
 *   genuinely contradicts the law rather than obeying its silences. Rare, and
 *   those cubes are marked.
 *
 * Nothing here repairs anything, and nothing offers to.
 */

import React, { useState } from 'react';
import {
  CheckableCube,
  cutTypeLabel,
  summarizeConnections,
  violationsSignature,
} from '../../lib/cube/connectionViolations';

const AXIS_LABEL: Record<'x' | 'y' | 'z', string> = {
  x: 'across',
  y: 'stacked',
  z: 'in depth',
};

interface ConnectionReadingProps {
  cubes: CheckableCube[];
  /** What the assembly is, in the sentence: "…in this proposal". */
  subject?: string;
}

export const ConnectionReading: React.FC<ConnectionReadingProps> = ({
  cubes,
  subject = 'this assembly',
}) => {
  const summary = React.useMemo(() => summarizeConnections(cubes), [cubes]);
  const { violations, totalAdjacencies, blankWall, mismatch, mismatchCubeIds } = summary;
  const signature = violationsSignature(violations);
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (totalAdjacencies === 0) return null;
  if (dismissedSignature === signature) return null;

  const connected = totalAdjacencies - violations.length;
  const crossedPairs = violations.filter(v => v.kind === 'mismatch');

  return (
    <div className="border border-ink-200 bg-ink-50/80 rounded-md px-2.5 py-2 text-[11px] text-ink-500 leading-relaxed">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <span className="text-ink-700">
            {connected} of {totalAdjacencies}{' '}
            {totalAdjacencies === 1 ? 'contact' : 'contacts'} in {subject}{' '}
            {connected === 1 ? 'opens' : 'open'}.
          </span>{' '}
          {blankWall > 0 && (
            <>
              {blankWall} {blankWall === 1 ? 'closes' : 'close'} against a blank wall — the
              vocabulary has no cut on the depth faces, so cubes front-to-back close unless
              they are tipped.
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDismissedSignature(signature)}
          className="text-ink-400 hover:text-ink-600 leading-none px-1"
          aria-label="Dismiss connection reading"
        >
          ×
        </button>
      </div>

      {mismatch > 0 && (
        <div className="mt-1.5 text-ink-700">
          {mismatch} {mismatch === 1 ? 'puts' : 'put'} a door against a window — against the
          law rather than closed by it. {mismatchCubeIds.size}{' '}
          {mismatchCubeIds.size === 1 ? 'cube is' : 'cubes are'} marked in the viewport.
        </div>
      )}

      {violations.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="mt-1 text-ink-400 hover:text-ink-600 underline underline-offset-2"
          >
            {expanded ? 'Hide' : 'Which contacts?'}
          </button>

          {expanded && (
            <ul className="mt-1.5 space-y-0.5 font-mono text-[10px] text-ink-500">
              {(crossedPairs.length > 0 ? crossedPairs : violations).map(v => (
                <li key={v.key}>
                  {v.a.variationId} ({cutTypeLabel(v.a.cutType)}) ↔ {v.b.variationId} (
                  {cutTypeLabel(v.b.cutType)}) — {AXIS_LABEL[v.axis]}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="mt-1.5 text-ink-400 text-[10px]">
        Read from each cube's variation faces, as built. A cut made later by a meme
        translation is not tracked here. Nothing has been changed.
      </div>
    </div>
  );
};
