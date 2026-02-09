import React from 'react';
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
 */
export const CompressibilitySparkline: React.FC<Props> = ({
  log,
  width = 218,
  height = 48,
}) => {
  if (log.length < 2) {
    return (
      <div style={{
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#475569',
        fontSize: 10,
        border: '1px solid #334155',
        borderRadius: 4,
        background: '#1e293b',
      }}>
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

  // Build line segments coloured by delta
  const segments: React.ReactNode[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const delta = log[i + 1].delta;
    const color = delta > 0.001 ? '#22c55e' : delta < -0.001 ? '#ef4444' : '#64748b';
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

  // Dots at each data point
  const dots = points.map((p, i) => (
    <circle
      key={i}
      cx={p.x}
      cy={p.y}
      r={2}
      fill={i === points.length - 1 ? '#f59e0b' : '#94a3b8'}
    />
  ));

  return (
    <div style={{
      border: '1px solid #334155',
      borderRadius: 4,
      background: '#1e293b',
      padding: 0,
    }}>
      <svg width={width} height={height}>
        {segments}
        {dots}
      </svg>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '2px 6px 4px',
        fontSize: 9,
        color: '#64748b',
      }}>
        <span>Gen 1</span>
        <span style={{ color: '#94a3b8' }}>
          {scores[scores.length - 1].toFixed(3)}
        </span>
        <span>Gen {log.length}</span>
      </div>
    </div>
  );
};
