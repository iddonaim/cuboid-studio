import React from 'react';
import type {
  CategoricalAxisReading,
  ContinuousAxisReading,
  SpatialReading,
} from '../../lib/api/encodeSpace';
import { DEFAULT_LEXICON } from '../../prompts/lexicon.default';

/** Strip trailing "spaces" and semicolon tails for compact pole labels. */
function compactPole(label: string): string {
  const base = label.replace(/\s+spaces$/i, '').trim();
  const semi = base.indexOf(';');
  if (semi === -1) return base;
  const head = base.slice(0, semi).trim();
  const tail = base
    .slice(semi + 1)
    .replace(/^minimal\/austere/i, 'austere')
    .replace(/^rich and diverse materiality/i, 'rich, diverse')
    .trim();
  if (!tail) return head;
  const shortHead = head.replace(/\s+lighting$/i, '').trim();
  return `${shortHead} / ${tail}`;
}

const ATMOSPHERE = {
  low: compactPole(DEFAULT_LEXICON.atmosphere.pole_low),
  mid: compactPole(DEFAULT_LEXICON.atmosphere.pole_mid),
  high: compactPole(DEFAULT_LEXICON.atmosphere.pole_high),
};

const LIGHT = {
  low: compactPole(DEFAULT_LEXICON.light.pole_low),
  high: compactPole(DEFAULT_LEXICON.light.pole_high),
};

const EMOTION = {
  low: compactPole(DEFAULT_LEXICON.emotion.pole_low),
  high: compactPole(DEFAULT_LEXICON.emotion.pole_high),
};

const AXIS_LABELS: Record<keyof SpatialReading, string> = {
  atmosphere: 'Atmosphere',
  light: 'Light',
  emotion: 'Emotion',
  rhythm: 'Rhythm',
  placement: 'Placement',
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function ContinuousRow({
  axisKey,
  reading,
  variant,
}: {
  axisKey: 'atmosphere' | 'light' | 'emotion';
  reading: ContinuousAxisReading;
  variant: 'three-pole' | 'two-pole';
}) {
  const poles =
    axisKey === 'atmosphere' ? ATMOSPHERE : axisKey === 'light' ? LIGHT : EMOTION;

  const markerLeft = `${clamp01(reading.position) * 100}%`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {AXIS_LABELS[axisKey]}
      </div>
      <p className="text-slate-200 text-[11px] leading-relaxed m-0">{reading.phrase}</p>
      <div className="relative pt-5 pb-1">
        <div className="relative h-1 rounded-full bg-slate-600/80">
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-sky-400 border border-sky-200/40 shadow-sm"
            style={{ left: markerLeft }}
          />
        </div>
        <div className="flex justify-between items-start gap-1 mt-1.5">
          <span className="text-[9px] text-slate-500 leading-tight max-w-[38%] text-left">
            {poles.low}
          </span>
          {variant === 'three-pole' && (
            <span className="text-[9px] text-slate-600 leading-tight max-w-[28%] text-center">
              {ATMOSPHERE.mid}
            </span>
          )}
          <span className="text-[9px] text-slate-500 leading-tight max-w-[38%] text-right">
            {poles.high}
          </span>
        </div>
      </div>
    </div>
  );
}

function CategoricalRow({
  axisKey,
  reading,
}: {
  axisKey: 'rhythm' | 'placement';
  reading: CategoricalAxisReading;
}) {
  const options =
    axisKey === 'rhythm'
      ? DEFAULT_LEXICON.rhythm.options
      : DEFAULT_LEXICON.placement.options;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {AXIS_LABELS[axisKey]}
      </div>
      <p className="text-slate-200 text-[11px] leading-relaxed m-0">{reading.phrase}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = opt.id === reading.option;
          return (
            <span
              key={opt.id}
              className={`px-1.5 py-0.5 rounded text-[9px] leading-snug ${
                active
                  ? 'bg-slate-600 text-slate-100 border border-slate-500'
                  : 'bg-transparent text-slate-600 border border-transparent'
              }`}
            >
              {opt.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export interface EncodingReadingPanelProps {
  reading: SpatialReading;
  readingEdited?: boolean;
}

export const EncodingReadingPanel: React.FC<EncodingReadingPanelProps> = ({
  reading,
  readingEdited = false,
}) => {
  return (
    <div className="p-2 bg-slate-800 border border-slate-700 rounded flex flex-col gap-3">
      <div className="min-w-0">
        <h3 className="text-slate-300 text-[11px] font-medium m-0 leading-snug">
          How the engine read this space
        </h3>
        <p className="text-slate-500 text-[10px] m-0 mt-0.5 leading-snug">
          An associative reading, not a measurement.
        </p>
        {readingEdited && (
          <p className="text-amber-600/90 text-[10px] m-0 mt-1 leading-snug">
            Revised by you — geometry unchanged.
          </p>
        )}
      </div>

      <ContinuousRow axisKey="atmosphere" reading={reading.atmosphere} variant="three-pole" />
      <ContinuousRow axisKey="light" reading={reading.light} variant="two-pole" />
      <ContinuousRow axisKey="emotion" reading={reading.emotion} variant="two-pole" />
      <CategoricalRow axisKey="rhythm" reading={reading.rhythm} />
      <CategoricalRow axisKey="placement" reading={reading.placement} />
    </div>
  );
};
