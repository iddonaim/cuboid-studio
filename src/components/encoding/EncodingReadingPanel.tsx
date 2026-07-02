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
  const markerLeft = `${clamp01(reading.position) * 100}%`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] uppercase tracking-wide text-ink-500">
        {AXIS_LABELS[axisKey]}
      </div>
      <p className="text-ink-800 text-[11px] leading-relaxed m-0">{reading.phrase}</p>
      <div className="relative pt-5 pb-1">
        <div className="relative h-1 rounded-full bg-ink-300/80">
          <div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-sky-400 border border-sky-200/40 shadow-sm"
            style={{ left: markerLeft }}
          />
        </div>
        <div className="flex justify-between items-start gap-1 mt-1.5">
          <span className="text-[9px] text-ink-500 leading-tight max-w-[38%] text-left">
            {poles.low}
          </span>
          {variant === 'three-pole' && poles.mid && (
            <span className="text-[9px] text-ink-400 leading-tight max-w-[28%] text-center">
              {poles.mid}
            </span>
          )}
          <span className="text-[9px] text-ink-500 leading-tight max-w-[38%] text-right">
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
      <div className="text-[10px] uppercase tracking-wide text-ink-500">
        {AXIS_LABELS[axisKey]}
      </div>
      <p className="text-ink-800 text-[11px] leading-relaxed m-0">{reading.phrase}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = opt.id === reading.option;
          return (
            <span
              key={opt.id}
              className={`px-1.5 py-0.5 rounded text-[9px] leading-snug ${
                active
                  ? 'bg-ink-300 text-ink-900 border border-ink-400'
                  : 'bg-transparent text-ink-400 border border-transparent'
              }`}
            >
              {opt.label}
            </span>
          );
        })}
        {/* If the model returned an option id not in the lexicon (open vocabulary),
            show it as an active chip so the reading isn't silent about it. */}
        {reading.option && !options.some(o => o.id === reading.option) && (
          <span className="px-1.5 py-0.5 rounded text-[9px] leading-snug bg-ink-300 text-ink-900 border border-ink-400">
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
}

export const EncodingReadingPanel: React.FC<EncodingReadingPanelProps> = ({
  reading,
  readingEdited = false,
  lexicon,
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
    <div className="p-2 bg-ink-100 border border-ink-200 rounded flex flex-col gap-3">
      <div className="min-w-0">
        <h3 className="text-ink-700 text-[11px] font-medium m-0 leading-snug">
          How the engine read this space
        </h3>
        <p className="text-ink-500 text-[10px] m-0 mt-0.5 leading-snug">
          An associative reading, not a measurement.
        </p>
        {readingEdited && (
          <p className="text-amber-600/90 text-[10px] m-0 mt-1 leading-snug">
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
