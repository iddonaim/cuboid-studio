/**
 * The count that goes with the outlined cubes.
 *
 * Always states the denominator: "25 of 43" is a reading, "25" on its own is
 * just a number with no scale. The breakdown separates the two kinds of
 * refusal, because they have different causes — a blank wall is growth running
 * into an uncut face, a mismatch is a door meeting a window.
 *
 * Non-blocking, dismissible, never modal, and deliberately not styled as an
 * error — a violation is a reading the architect makes a decision about, not a
 * failure the app needs to recover from. Nothing here offers to fix anything,
 * because nothing in this feature repairs an assembly.
 *
 * Dismissal is keyed to the violation set, so it stays dismissed while the
 * assembly is unchanged and comes back when a new encode produces a different
 * set — rather than nagging on every render or hiding a genuinely new finding.
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

interface ConnectionViolationNoticeProps {
  cubes: CheckableCube[];
  /** What the assembly is, in the sentence: "…in this proposal". */
  subject?: string;
}

export const ConnectionViolationNotice: React.FC<ConnectionViolationNoticeProps> = ({
  cubes,
  subject = 'this assembly',
}) => {
  const summary = React.useMemo(() => summarizeConnections(cubes), [cubes]);
  const { violations, totalAdjacencies, blankWall, mismatch, cubeIds } = summary;
  const signature = violationsSignature(violations);
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (violations.length === 0) return null;
  if (dismissedSignature === signature) return null;

  return (
    <div className="border border-ink-200 bg-ink-50/80 rounded-md px-2.5 py-2 text-[11px] text-ink-500 leading-relaxed">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <span className="text-ink-700">
            {violations.length} of {totalAdjacencies}{' '}
            {totalAdjacencies === 1 ? 'adjacency' : 'adjacencies'} in {subject}{' '}
            {violations.length === 1 ? 'violates' : 'violate'} the connection law
          </span>
          , across {cubeIds.size} {cubeIds.size === 1 ? 'cube' : 'cubes'}. Those cubes are
          outlined in the viewport. Nothing has been changed — this is for your judgment.
        </div>
        <button
          type="button"
          onClick={() => setDismissedSignature(signature)}
          className="text-ink-400 hover:text-ink-600 leading-none px-1"
          aria-label="Dismiss connection-law notice"
        >
          ×
        </button>
      </div>

      <div className="mt-1 text-ink-400">
        {blankWall > 0 && (
          <>
            {blankWall} {blankWall === 1 ? 'stops' : 'stop'} at a blank wall
          </>
        )}
        {blankWall > 0 && mismatch > 0 && ' · '}
        {mismatch > 0 && (
          <>
            {mismatch} {mismatch === 1 ? 'puts' : 'put'} a door against a window
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="mt-1 text-ink-400 hover:text-ink-600 underline underline-offset-2"
      >
        {expanded ? 'Hide' : 'Which ones?'}
      </button>

      {expanded && (
        <ul className="mt-1.5 space-y-0.5 font-mono text-[10px] text-ink-500">
          {violations.map(v => (
            <li key={v.key}>
              {v.a.variationId} ({cutTypeLabel(v.a.cutType)}) ↔ {v.b.variationId} (
              {cutTypeLabel(v.b.cutType)}) — {AXIS_LABEL[v.axis]}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1.5 text-ink-400 text-[10px]">
        Checked against each cube's variation faces, as built. A cut made later by a meme
        translation is not tracked here.
      </div>
    </div>
  );
};
