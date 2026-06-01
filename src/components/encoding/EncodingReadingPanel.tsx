import React, { useCallback, useRef, useState } from 'react';
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
  editing,
  onPhraseChange,
  onPositionChange,
}: {
  axisKey: 'atmosphere' | 'light' | 'emotion';
  reading: ContinuousAxisReading;
  variant: 'three-pole' | 'two-pole';
  editing: boolean;
  onPhraseChange?: (phrase: string) => void;
  onPositionChange?: (position: number) => void;
}) {
  const poles =
    axisKey === 'atmosphere' ? ATMOSPHERE : axisKey === 'light' ? LIGHT : EMOTION;

  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const positionFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return reading.position;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return reading.position;
      return clamp01((clientX - rect.left) / rect.width);
    },
    [reading.position],
  );

  const markerLeft = `${clamp01(reading.position) * 100}%`;

  const handleTrackPointer = (clientX: number) => {
    onPositionChange?.(positionFromClientX(clientX));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {AXIS_LABELS[axisKey]}
      </div>
      {editing ? (
        <textarea
          value={reading.phrase}
          onChange={(e) => onPhraseChange?.(e.target.value)}
          rows={2}
          className="w-full px-1.5 py-1 text-[11px] leading-relaxed bg-slate-900 border border-slate-600 rounded text-slate-200 resize-y min-h-[2.5rem] outline-none focus:border-slate-500"
        />
      ) : (
        <p className="text-slate-200 text-[11px] leading-relaxed m-0">{reading.phrase}</p>
      )}
      <div className="relative pt-5 pb-1">
        <div
          ref={trackRef}
          className={`relative h-1 rounded-full bg-slate-600/80 ${editing ? 'cursor-pointer touch-none' : ''}`}
          aria-hidden={!editing}
          onPointerDown={
            editing
              ? (e) => {
                  if ((e.target as HTMLElement).dataset.marker === '1') return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragging(true);
                  handleTrackPointer(e.clientX);
                }
              : undefined
          }
          onPointerMove={
            editing
              ? (e) => {
                  if (!dragging) return;
                  handleTrackPointer(e.clientX);
                }
              : undefined
          }
          onPointerUp={
            editing
              ? (e) => {
                  setDragging(false);
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
              : undefined
          }
          onPointerCancel={
            editing
              ? (e) => {
                  setDragging(false);
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
              : undefined
          }
        >
          <div
            data-marker="1"
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-sky-400 border border-sky-200/40 shadow-sm ${
              editing ? 'cursor-grab active:cursor-grabbing touch-none' : ''
            }`}
            style={{ left: markerLeft }}
            aria-label={editing ? `Adjust ${AXIS_LABELS[axisKey]} reading` : undefined}
            onPointerDown={
              editing
                ? (e) => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDragging(true);
                    handleTrackPointer(e.clientX);
                  }
                : undefined
            }
            onPointerMove={
              editing
                ? (e) => {
                    if (!dragging) return;
                    e.stopPropagation();
                    handleTrackPointer(e.clientX);
                  }
                : undefined
            }
            onPointerUp={
              editing
                ? (e) => {
                    setDragging(false);
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }
                : undefined
            }
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
  editing,
  onPhraseChange,
  onOptionChange,
}: {
  axisKey: 'rhythm' | 'placement';
  reading: CategoricalAxisReading;
  editing: boolean;
  onPhraseChange?: (phrase: string) => void;
  onOptionChange?: (option: string) => void;
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
      {editing ? (
        <textarea
          value={reading.phrase}
          onChange={(e) => onPhraseChange?.(e.target.value)}
          rows={2}
          className="w-full px-1.5 py-1 text-[11px] leading-relaxed bg-slate-900 border border-slate-600 rounded text-slate-200 resize-y min-h-[2.5rem] outline-none focus:border-slate-500"
        />
      ) : (
        <p className="text-slate-200 text-[11px] leading-relaxed m-0">{reading.phrase}</p>
      )}
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = opt.id === reading.option;
          if (editing) {
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onOptionChange?.(opt.id)}
                className={`px-1.5 py-0.5 rounded text-[9px] leading-snug border cursor-pointer ${
                  active
                    ? 'bg-slate-600 text-slate-100 border-slate-500'
                    : 'bg-transparent text-slate-500 border-slate-700 hover:border-slate-600'
                }`}
              >
                {opt.label}
              </button>
            );
          }
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
  onReadingChange: (reading: SpatialReading) => void;
}

export const EncodingReadingPanel: React.FC<EncodingReadingPanelProps> = ({
  reading,
  readingEdited = false,
  onReadingChange,
}) => {
  const [editing, setEditing] = useState(false);

  const patch = (partial: Partial<SpatialReading>) => {
    onReadingChange({ ...reading, ...partial });
  };

  return (
    <div className="p-2 bg-slate-800 border border-slate-700 rounded flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-slate-300 text-[11px] font-medium m-0 leading-snug">
            How the engine read this space
          </h3>
          <p className="text-slate-500 text-[10px] m-0 mt-0.5 leading-snug">
            An associative reading, not a measurement.
          </p>
          {readingEdited && !editing && (
            <p className="text-amber-600/90 text-[10px] m-0 mt-1 leading-snug">
              Revised by you — geometry unchanged.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="shrink-0 text-[10px] text-slate-500 hover:text-slate-300 bg-transparent border-0 cursor-pointer underline-offset-2 hover:underline p-0"
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      <ContinuousRow
        axisKey="atmosphere"
        reading={reading.atmosphere}
        variant="three-pole"
        editing={editing}
        onPhraseChange={(phrase) =>
          patch({ atmosphere: { ...reading.atmosphere, phrase } })
        }
        onPositionChange={(position) =>
          patch({ atmosphere: { ...reading.atmosphere, position } })
        }
      />
      <ContinuousRow
        axisKey="light"
        reading={reading.light}
        variant="two-pole"
        editing={editing}
        onPhraseChange={(phrase) => patch({ light: { ...reading.light, phrase } })}
        onPositionChange={(position) =>
          patch({ light: { ...reading.light, position } })
        }
      />
      <ContinuousRow
        axisKey="emotion"
        reading={reading.emotion}
        variant="two-pole"
        editing={editing}
        onPhraseChange={(phrase) =>
          patch({ emotion: { ...reading.emotion, phrase } })
        }
        onPositionChange={(position) =>
          patch({ emotion: { ...reading.emotion, position } })
        }
      />
      <CategoricalRow
        axisKey="rhythm"
        reading={reading.rhythm}
        editing={editing}
        onPhraseChange={(phrase) => patch({ rhythm: { ...reading.rhythm, phrase } })}
        onOptionChange={(option) => patch({ rhythm: { ...reading.rhythm, option } })}
      />
      <CategoricalRow
        axisKey="placement"
        reading={reading.placement}
        editing={editing}
        onPhraseChange={(phrase) =>
          patch({ placement: { ...reading.placement, phrase } })
        }
        onOptionChange={(option) =>
          patch({ placement: { ...reading.placement, option } })
        }
      />
    </div>
  );
};
