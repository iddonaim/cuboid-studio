import React, { useEffect, useState } from 'react';
import { useEncodingStore } from '../../store/useEncodingStore';
import { useMemeStore } from '../../store/useMemeStore';
import { useEvolutionStore } from '../../store/useEvolutionStore';

/* ────────────────────────────────────────────────────────────────────────
 * API activity indicator — the drafting-table answer to the Windows 95
 * flying-file animation. Whenever a model call is in flight (encode,
 * pataphysical translation, evolution generation), a small pill shows a
 * document flying from a "culture" glyph into a cube, plus a rotating
 * playful message, so the wait is legible instead of mysterious.
 * ──────────────────────────────────────────────────────────────────────── */

type Activity = { kind: string; messages: string[] } | null;

const MESSAGES: Record<string, string[]> = {
  encode: [
    'Reading the photographs…',
    'Weighing atmosphere, light, emotion…',
    'Sensing rhythm and placement…',
    'Choosing cubes to match the space…',
  ],
  'translate-reading': [
    'Reading the meme…',
    'Extracting rhetorical moves…',
    'Listening for cultural tensions…',
  ],
  'translate-geometry': [
    'Choosing a spatial operator…',
    'Aiming the cutter…',
    'Negotiating magnitude and decay…',
  ],
  evolve: [
    'Sampling memes from the pool…',
    'Translating candidates in parallel…',
    'Letting culture argue with geometry…',
  ],
  'evolve-scoring': [
    'Scoring compressibility…',
    'Ranking candidates by interestingness…',
  ],
};

function useActivity(): Activity {
  const isEncoding = useEncodingStore(s => s.isEncoding);
  const isTranslating = useMemeStore(s => s.isTranslating);
  const translationPhase = useMemeStore(s => s.translationPhase);
  const isGenerating = useEvolutionStore(s => s.isGenerating);
  const generationPhase = useEvolutionStore(s => s.generationPhase);

  if (isEncoding) return { kind: 'encode', messages: MESSAGES.encode };
  if (isTranslating) {
    const kind = translationPhase === 'geometry' ? 'translate-geometry' : 'translate-reading';
    return { kind, messages: MESSAGES[kind] };
  }
  if (isGenerating) {
    const kind = generationPhase === 'scoring' ? 'evolve-scoring' : 'evolve';
    return { kind, messages: MESSAGES[kind] };
  }
  return null;
}

/** Tiny document sheet flying from a speech-bubble (culture) into a cube (geometry). */
const TransferAnimation: React.FC = () => (
  <svg width="92" height="26" viewBox="0 0 92 26" aria-hidden className="flex-shrink-0">
    {/* Speech bubble — the meme side */}
    <g stroke="#7C786C" strokeWidth="1.2" fill="none">
      <rect x="3" y="6" width="14" height="10" rx="2.5" />
      <path d="M7 16 L7 20 L11 16" />
    </g>
    {/* Dashed flight path */}
    <path d="M22 13 H70" stroke="#DAD6CB" strokeWidth="1" strokeDasharray="3 3" />
    {/* The flying document */}
    <g className="api-flying-doc">
      <rect x="-3.5" y="-4.5" width="7" height="9" rx="1" fill="#FFFFFF" stroke="#BC4A1F" strokeWidth="1.1" />
      <path d="M-1.5 -1.5 H1.5 M-1.5 0.5 H1.5 M-1.5 2.5 H0.5" stroke="#BC4A1F" strokeWidth="0.7" />
    </g>
    {/* Cube — the geometry side */}
    <g stroke="#24221C" strokeWidth="1.2" fill="#FFFFFF" strokeLinejoin="round">
      <path d="M75 9.5 L81 6.5 L87 9.5 L87 16.5 L81 19.5 L75 16.5 Z" />
      <path d="M75 9.5 L81 12.5 L87 9.5 M81 12.5 L81 19.5" fill="none" />
    </g>
  </svg>
);

export const ApiActivityIndicator: React.FC = () => {
  const activity = useActivity();
  const [msgIndex, setMsgIndex] = useState(0);

  // Rotate messages while active; reset when the activity kind changes
  useEffect(() => {
    setMsgIndex(0);
    if (!activity) return;
    const id = setInterval(() => setMsgIndex(i => i + 1), 2600);
    return () => clearInterval(id);
  }, [activity?.kind]);

  if (!activity) return null;

  const message = activity.messages[msgIndex % activity.messages.length];

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[95] flex items-center gap-2.5 rounded-full pl-3 pr-4 py-1.5 pointer-events-none"
      style={{
        bottom: 60,
        background: 'hsl(var(--card) / 0.95)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        border: '1px solid hsl(var(--border))',
        boxShadow: '0 4px 20px hsl(45 9% 13% / 0.12)',
      }}
      role="status"
      aria-live="polite"
    >
      <TransferAnimation />
      <span key={message} className="text-[11px] text-ink-700 whitespace-nowrap onboarding-frame-in">
        {message}
      </span>
    </div>
  );
};
