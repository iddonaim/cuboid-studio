import React from 'react';
import { useAccent } from '../../contexts/AccentContext';
import type { CompressibilitySnapshot } from '../../lib/evolution/compressibility';

interface Props {
  log: CompressibilitySnapshot[];
  width?: number;
  height?: number;
}

/**
 * Tiny SVG sparkline showing compressibility score over generations.
 * The slope of the line = interestingness (compression progress).
 * Green segments = positive delta (interesting), red = negative (boring).
 *
 * NOTE: All SVG rendering logic (coordinate math, segment colors, dot positions)
 * is intentionally unchanged. Only wrapper/legend styles were migrated.
 */
export const CompressibilitySparkline: React.FC<Props> = ({
  log,
  width = 218,
  height = 48,
}) => {
  const { accent } = useAccent();
  if (log.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-ink-400 text-[11px] border border-ink-200 rounded bg-ink-100"
        style={{ width, height }}
      >
        {log.length === 0 ? 'No data yet' : 'Need 2+ generations'}
      </div>
    );
  }

  const padding = 4;
  const plotW = width - padding * 2;
  const plotH = height - padding * 2;

  const scores = log.map(s => s.score.total);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const range = maxScore - minScore || 0.01; // avoid division by zero

  // Map data to SVG coordinates
  const points = scores.map((score, i) => ({
    x: padding + (i / (scores.length - 1)) * plotW,
    y: padding + plotH - ((score - minScore) / range) * plotH,
  }));

  // Build line segments coloured by delta — do not modify this rendering logic
  const segments: React.ReactNode[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const delta = log[i + 1].delta;
    const color = delta > 0.001 ? '#3d8a4e' : delta < -0.001 ? '#b03a2e' : '#7c786c';
    segments.push(
      <line
        key={i}
        x1={points[i].x}
        y1={points[i].y}
        x2={points[i + 1].x}
        y2={points[i + 1].y}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    );
  }

  // Dots at each data point — do not modify this rendering logic
  const dots = points.map((p, i) => (
    <circle
      key={i}
      cx={p.x}
      cy={p.y}
      r={2}
      fill={i === points.length - 1 ? accent : '#a39f93'}
    />
  ));

  return (
    <div className="border border-ink-200 rounded bg-ink-100">
      <svg width={width} height={height}>
        {segments}
        {dots}
      </svg>
      <div className="flex justify-between px-1.5 pb-1 pt-0.5 text-[10px] text-ink-500">
        <span>Gen 1</span>
        <span className="text-ink-600">{scores[scores.length - 1].toFixed(3)}</span>
        <span>Gen {log.length}</span>
      </div>
    </div>
  );
};
