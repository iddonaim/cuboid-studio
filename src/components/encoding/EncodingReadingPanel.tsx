import React from 'react';
import type {
  CategoricalAxisReading,
  ContinuousAxisReading,
  SpatialReading,
} from '../../lib/api/encodeSpace';
import { DEFAULT_LEXICON, type SpatialLexicon } from '../../prompts/lexicon.default';

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
  poles,
}: {
  axisKey: 'atmosphere' | 'light' | 'emotion';
  reading: ContinuousAxisReading;
  variant: 'three-pole' | 'two-pole';
  poles: { low: string; mid?: string; high: string };
}) {
  const pct = clamp01(reading.position) * 100;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
          {AXIS_LABELS[axisKey]}
        </span>
        <span className="font-mono text-[10px] text-ink-400">
          {(clamp01(reading.position)).toFixed(2)}
        </span>
      </div>
      <p className="text-ink-800 text-[12px] leading-relaxed m-0">{reading.phrase}</p>
      <div className="relative pt-4 pb-1">
        {/* Track — filled up to the marker so the reading has visual weight,
            like the Evolution score bars. */}
        <div className="relative h-1.5 rounded-full bg-ink-200 overflow-visible">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary/25"
            style={{ width: `${pct}%` }}
          />
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-card shadow"
            style={{ left: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between items-start gap-1 mt-1.5">
          <span className="text-[10px] text-ink-500 leading-tight max-w-[38%] text-left">
            {poles.low}
          </span>
          {variant === 'three-pole' && poles.mid && (
            <span className="text-[10px] text-ink-400 leading-tight max-w-[28%] text-center">
              {poles.mid}
            </span>
          )}
          <span className="text-[10px] text-ink-500 leading-tight max-w-[38%] text-right">
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
  options,
}: {
  axisKey: 'rhythm' | 'placement';
  reading: CategoricalAxisReading;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-500">
        {AXIS_LABELS[axisKey]}
      </span>
      <p className="text-ink-800 text-[12px] leading-relaxed m-0">{reading.phrase}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = opt.id === reading.option;
          return (
            <span
              key={opt.id}
              className={`px-2 py-0.5 rounded-full text-[10px] leading-snug border ${
                active
                  ? 'bg-primary/10 text-primary border-primary font-medium'
                  : 'bg-transparent text-ink-400 border-ink-200'
              }`}
            >
              {opt.label}
            </span>
          );
        })}
        {/* If the model returned an option id not in the lexicon (open vocabulary),
            show it as an active chip so the reading isn't silent about it. */}
        {reading.option && !options.some(o => o.id === reading.option) && (
          <span className="px-2 py-0.5 rounded-full text-[10px] leading-snug bg-primary/10 text-primary border border-primary font-medium">
            {reading.option}
          </span>
        )}
      </div>
    </div>
  );
}

export interface EncodingReadingPanelProps {
  reading: SpatialReading;
  readingEdited?: boolean;
  /**
   * The lexicon that produced this reading. When provided, pole labels and
   * option sets are sourced from it — this is what makes a custom-lexicon
   * encode display its own vocabulary rather than the default's.
   *
   * Pass `encodingLexicon` from useEncodingStore (captured at encode time;
   * restored from `lexiconSnapshot` when a composition is loaded).
   * Falls back to DEFAULT_LEXICON when absent.
   */
  lexicon?: SpatialLexicon | null;
  /** Display name of the lexicon that produced the reading (e.g. "Default"). */
  lexiconName?: string | null;
}

export const EncodingReadingPanel: React.FC<EncodingReadingPanelProps> = ({
  reading,
  readingEdited = false,
  lexicon,
  lexiconName,
}) => {
  // Source all vocabulary from the lexicon that produced the reading.
  // Null / undefined both fall back to the built-in default.
  const lex = lexicon ?? DEFAULT_LEXICON;

  const atmospherePoles = {
    low: compactPole(lex.atmosphere.pole_low),
    mid: compactPole(lex.atmosphere.pole_mid),
    high: compactPole(lex.atmosphere.pole_high),
  };
  const lightPoles = {
    low: compactPole(lex.light.pole_low),
    high: compactPole(lex.light.pole_high),
  };
  const emotionPoles = {
    low: compactPole(lex.emotion.pole_low),
    high: compactPole(lex.emotion.pole_high),
  };

  return (
    <div className="p-2.5 bg-ink-100 border border-ink-200 rounded-md flex flex-col gap-3.5">
      <div className="min-w-0 border-b border-ink-200 pb-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-ink-700 text-[12px] font-medium m-0 leading-snug">
            How the engine read this space
          </h3>
          {lexiconName && (
            <span className="shrink-0 px-1.5 py-0.5 rounded bg-ink-200 text-ink-600 font-mono text-[9px] uppercase tracking-wide">
              {lexiconName}
            </span>
          )}
        </div>
        <p className="text-ink-500 text-[11px] m-0 mt-0.5 leading-snug">
          An associative reading, not a measurement.
        </p>
        {readingEdited && (
          <p className="text-amber-600/90 text-[11px] m-0 mt-1 leading-snug">
            Revised by you — geometry unchanged.
          </p>
        )}
      </div>

      <ContinuousRow
        axisKey="atmosphere"
        reading={reading.atmosphere}
        variant="three-pole"
        poles={atmospherePoles}
      />
      <ContinuousRow
        axisKey="light"
        reading={reading.light}
        variant="two-pole"
        poles={lightPoles}
      />
      <ContinuousRow
        axisKey="emotion"
        reading={reading.emotion}
        variant="two-pole"
        poles={emotionPoles}
      />
      <CategoricalRow
        axisKey="rhythm"
        reading={reading.rhythm}
        options={lex.rhythm.options}
      />
      <CategoricalRow
        axisKey="placement"
        reading={reading.placement}
        options={lex.placement.options}
      />
    </div>
  );
};
