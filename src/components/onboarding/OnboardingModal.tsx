import React, { useEffect, useState } from 'react';
import { CANONICAL_ACCENT } from '../../lib/theme/accent';
import {
  Rotate3d,
  Slice,
  Boxes,
  Camera,
  Link,
  PanelLeft,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '@/components/ui/button';

/* ────────────────────────────────────────────────────────────────────────
 * Onboarding showcase modal — seven frames per docs/design/onboarding-script.md
 * (v4). Frames 1/6/7 are diagrams drawn inline in the drafting palette;
 * frames 2–5 are swappable screenshot slots (public/onboarding-screens/).
 * Auto-opens on first visit; reopens from the TopBar "?" button.
 * ──────────────────────────────────────────────────────────────────────── */

const INK = '#24221C';
const MUTED = '#7C786C';
const LINE = '#DAD6CB';
// Canonical drafting vermilion — the onboarding diagram is a fixed brand
// illustration and intentionally ignores the user's chosen UI accent.
const VERMILION = CANONICAL_ACCENT;

/* ── Frame 1 — cube → cutters → 70 variations ── */
const PrimitivesDiagram: React.FC = () => (
  <svg viewBox="0 0 560 260" className="w-full h-full" role="img" aria-label="A cube cut by primitive cutters, producing 70 variations">
    <g fill="none" strokeLinejoin="round">
      {/* Isometric cube */}
      <g stroke={INK} strokeWidth="1.4">
        <path d="M100 80 L160 55 L220 80 L220 150 L160 175 L100 150 Z" fill="#FFFFFF" />
        <path d="M100 80 L160 105 L220 80" />
        <path d="M160 105 L160 175" />
      </g>
      {/* Cutters — vermilion, overlapping the cube */}
      <g stroke={VERMILION} strokeWidth="1.3">
        <circle cx="120" cy="95" r="26" strokeDasharray="3 3" />
        <circle cx="200" cy="140" r="22" strokeDasharray="3 3" />
        <ellipse cx="160" cy="62" rx="24" ry="10" strokeDasharray="3 3" />
        <ellipse cx="205" cy="100" rx="9" ry="20" strokeDasharray="3 3" />
      </g>
      <text x="160" y="205" textAnchor="middle" fill={MUTED} fontSize="10" fontFamily="'Geist Mono Variable', monospace">42 mm cube · 4 of 8 cutters</text>
      {/* Arrow */}
      <path d="M255 115 H300" stroke={MUTED} strokeWidth="1.2" />
      <path d="M295 110 L303 115 L295 120" stroke={MUTED} strokeWidth="1.2" fill="none" />
      {/* Variation glyph grid: 4 rows x 6 cols of small cut squares */}
      {Array.from({ length: 24 }).map((_, i) => {
        const col = i % 6, row = Math.floor(i / 6);
        const x = 322 + col * 32, y = 42 + row * 32;
        const r = 5 + ((i * 7) % 6);
        const corner = i % 4;
        const cx = corner < 2 ? x + (corner === 0 ? 0 : 24) : x + (corner === 2 ? 0 : 24);
        const cy = corner % 2 === 0 ? y : y + 24;
        return (
          <g key={i} stroke={INK} strokeWidth="1">
            <rect x={x} y={y} width="24" height="24" fill="#FFFFFF" />
            <circle cx={cx} cy={cy} r={r} fill="#F1EFE9" />
          </g>
        );
      })}
      <text x="418" y="205" textAnchor="middle" fill={MUTED} fontSize="10" fontFamily="'Geist Mono Variable', monospace">
        <tspan fill={VERMILION} fontWeight="600">70</tspan> variations · shared cutter = can sit side by side
      </text>
    </g>
  </svg>
);

/* ── Frame 6 — toolkit icon strip ── */
const TOOLKIT: Array<{ icon: React.ReactNode; label: string }> = [
  { icon: <Rotate3d size={20} strokeWidth={1.5} />, label: 'Orbit · ortho' },
  { icon: <Slice size={20} strokeWidth={1.5} />, label: 'Section cut' },
  { icon: <Boxes size={20} strokeWidth={1.5} />, label: 'Edit assembly' },
  { icon: <Camera size={20} strokeWidth={1.5} />, label: 'Save states' },
  { icon: <PanelLeft size={20} strokeWidth={1.5} />, label: '⌘B sidebar' },
  { icon: <Link size={20} strokeWidth={1.5} />, label: 'Grasshopper · GitHub' },
];

const ToolkitDiagram: React.FC = () => (
  <div className="w-full h-full flex items-center justify-center">
    <div className="grid grid-cols-3 gap-x-8 gap-y-6 px-6">
      {TOOLKIT.map(({ icon, label }) => (
        <div key={label} className="flex flex-col items-center gap-2">
          <div className="w-11 h-11 rounded-lg bg-white border border-ink-200 flex items-center justify-center text-ink-700">
            {icon}
          </div>
          <span className="font-mono text-[9px] uppercase tracking-wide text-ink-500 text-center whitespace-nowrap">
            {label}
          </span>
        </div>
      ))}
    </div>
  </div>
);

/* ── Frame 7 — pipeline lit in sequence ── */
const PIPELINE = ['Map', 'Encode', 'Evolution', 'Decode'];
const PIPELINE_CAPTIONS = ['ground', 'space', 'culture', 'drawing'];

const PipelineDiagram: React.FC = () => (
  <div className="w-full h-full flex flex-col items-center justify-center gap-5">
    <div className="flex items-center">
      {PIPELINE.map((stage, i) => (
        <React.Fragment key={stage}>
          {i > 0 && <div className="w-8 sm:w-12 h-px" style={{ background: LINE }} />}
          <div
            className="flex flex-col items-center gap-1.5 onboarding-pipeline-node"
            style={{ animationDelay: `${i * 0.9}s` }}
          >
            <div className="w-3 h-3 rounded-full border pipeline-dot" style={{ borderColor: INK }} />
            <span className="font-mono text-[10px] uppercase tracking-wider text-ink-700">{stage}</span>
            <span className="text-[9px] text-ink-400">{PIPELINE_CAPTIONS[i]}</span>
          </div>
        </React.Fragment>
      ))}
    </div>
    <div className="font-mono text-[10px] text-ink-500">ground → space → culture → drawing</div>
  </div>
);

/* ── Frames 2–5 — swappable screenshot slots with drawn fallbacks ── */
const MapFallback: React.FC = () => (
  <svg viewBox="0 0 560 260" className="w-full h-full" role="img" aria-label="Map with a dropped pin and site data">
    <g fill="none">
      <rect x="120" y="30" width="320" height="200" rx="6" fill="#FFFFFF" stroke={LINE} />
      {[70, 110, 150, 190].map(y => <path key={y} d={`M120 ${y} H440`} stroke={LINE} strokeWidth="0.8" />)}
      {[190, 260, 330, 400].map(x => <path key={x} d={`M${x} 30 V230`} stroke={LINE} strokeWidth="0.8" />)}
      <circle cx="280" cy="128" r="52" stroke={VERMILION} strokeDasharray="4 3" strokeWidth="1.2" />
      <path d="M280 138 C280 138 292 122 292 113 A12 12 0 1 0 268 113 C268 122 280 138 280 138 Z" fill={VERMILION} />
      {[[220, 90], [330, 70], [360, 160], [230, 180], [310, 200]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={MUTED} />
      ))}
      <text x="280" y="250" textAnchor="middle" fill={MUTED} fontSize="10" fontFamily="'Geist Mono Variable', monospace">buildings · streets · transit · demographics</text>
    </g>
  </svg>
);

const ScreenshotSlot: React.FC<{ name: string; fallback?: React.ReactNode }> = ({ name, fallback }) => {
  const [failed, setFailed] = useState(false);
  if (failed && fallback) return <>{fallback}</>;
  return (
    <img
      src={`/onboarding-screens/${name}.png`}
      alt={`${name} stage of Cuboid Studio`}
      className="w-full h-full object-contain"
      onError={() => setFailed(true)}
    />
  );
};

/* ── Frame content (copy verbatim from script v4) ── */
interface Frame {
  title: string;
  lead?: string;
  bullets: string[];
  visual: React.ReactNode;
}

const FRAMES: Frame[] = [
  {
    title: 'One vocabulary, measurable culture',
    lead: 'Most site analysis misses the cultural layer. This makes it measurable.',
    bullets: [
      'Built from primitives — a 42 mm cube cut by 4 of 8 fixed cutters (spheres & cylinders) → 70 variations',
      'The rule: cubes that share a cutter can sit side by side',
      'Four stages build on this: Map · Encode · Evolution · Decode',
    ],
    visual: <PrimitivesDiagram />,
  },
  {
    title: 'Meet the real site',
    lead: 'The base context layer every architecture project starts from.',
    bullets: [
      'Type an address',
      'Gathers buildings (2D→3D massing + heights), streets, transit, demographics',
      'Becomes the shared input every later stage builds on',
    ],
    visual: <ScreenshotSlot name="map" fallback={<MapFallback />} />,
  },
  {
    title: 'Read a real space',
    lead: 'Photograph a space; the model reads its logic — you curate it.',
    bullets: [
      'Upload 1–7 photos (one primary)',
      'Five-axis reading: atmosphere · light · emotion · rhythm · placement',
      'Proposes a cuboid seed assembly',
      'Vocabulary = an editable lexicon — prompt is the artifact',
    ],
    visual: <ScreenshotSlot name="encode" />,
  },
  {
    title: 'Let culture push the form',
    lead: 'A meme becomes a geometric move.',
    bullets: [
      'Translates a meme → cultural reading → spatial operator (erosion · reinforcement · drift)',
      'Confidence as four dials (rhetorical, site, affect, operation) — shows where the move is well-grounded',
      'Preview as a vermilion-highlighted cube → apply or undo',
    ],
    visual: <ScreenshotSlot name="evolution" />,
  },
  {
    title: 'A diagram to intervene from',
    lead: 'The result is a notation diagram — the rules of engagement for the site.',
    bullets: [
      '3D assembly flattens to a 2D notation canvas',
      'Glyph tiles snap to a grid, rotatable',
      'Read alongside the photos & site context as the basis for intervention',
      'Export to DXF & SVG',
    ],
    visual: <ScreenshotSlot name="decode" />,
  },
  {
    title: 'Tools that run throughout',
    bullets: [
      'Navigate the 3D cube — orbit, pan, ortho mode',
      'Section-cut to look inside an assembly',
      'Hand-edit a seed assembly inside Encode',
      'Save screenshots / states as you go',
      'Sidebar hides with Cmd/Ctrl+B for a full-bleed view',
      'Live round-trip to Grasshopper · code on GitHub',
    ],
    visual: <ToolkitDiagram />,
  },
  {
    title: 'Model as engine, prompt as artifact',
    lead: 'The pipeline, end to end.',
    bullets: [
      'Map gathers the ground',
      'Encode reads the space',
      'Evolution lets culture act',
      'Decode makes the diagram',
      'The judgment lives in the prompts & lexicon',
    ],
    visual: <PipelineDiagram />,
  },
];

export const OnboardingModal: React.FC = () => {
  const open = useAppStore(s => s.onboardingOpen);
  const close = useAppStore(s => s.closeOnboarding);
  const startTour = useAppStore(s => s.startTour);
  const [index, setIndex] = useState(0);

  // Keyboard navigation while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') setIndex(i => Math.min(FRAMES.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Restart at frame 1 whenever reopened
  useEffect(() => { if (open) setIndex(0); }, [open]);

  if (!open) return null;

  const frame = FRAMES[index];
  const isLast = index === FRAMES.length - 1;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'hsl(45 9% 13% / 0.35)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Cuboid Studio introduction"
      onClick={e => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        className="w-full max-w-[680px] max-h-[calc(var(--app-vh)*0.88)] flex flex-col rounded-xl overflow-hidden"
        style={{
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          boxShadow: '0 24px 64px hsl(45 9% 13% / 0.22)',
        }}
      >
        {/* Visual area */}
        <div className="bg-ink-100 border-b border-ink-200 h-[220px] sm:h-[280px] flex-shrink-0 overflow-hidden">
          <div key={index} className="w-full h-full onboarding-frame-in">
            {frame.visual}
          </div>
        </div>

        {/* Text area */}
        <div key={`text-${index}`} className="px-6 pt-4 pb-2 overflow-y-auto onboarding-frame-in">
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-400 mb-1">
            {String(index + 1).padStart(2, '0')} · {String(FRAMES.length).padStart(2, '0')}
          </div>
          <h2 className="text-[21px] font-semibold text-ink-900 m-0 mb-1.5">{frame.title}</h2>
          {frame.lead && (
            <p className="text-[14.5px] text-ink-600 m-0 mb-2.5 leading-snug">{frame.lead}</p>
          )}
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {frame.bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-[14px] text-ink-700 leading-relaxed">
                <span className="text-primary flex-shrink-0 select-none">—</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            {FRAMES.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                aria-label={`Go to frame ${i + 1}`}
                className={`w-1.5 h-1.5 rounded-full border-0 p-0 cursor-pointer transition-colors ${
                  i === index ? 'bg-primary' : 'bg-ink-300 hover:bg-ink-400'
                }`}
              />
            ))}
          </div>
          <div className="flex-1" />
          {!isLast && (
            <>
              <button
                onClick={startTour}
                title="Interactive walkthrough of the live interface"
                className="bg-transparent border-0 text-ink-400 hover:text-ink-600 cursor-pointer text-[13px] px-1"
              >
                Guided tour
              </button>
              <button
                onClick={close}
                className="bg-transparent border-0 text-ink-400 hover:text-ink-600 cursor-pointer text-[13px] px-1"
              >
                Skip
              </button>
            </>
          )}
          {isLast && (
            <button
              onClick={close}
              className="bg-transparent border-0 text-ink-400 hover:text-ink-600 cursor-pointer text-[13px] px-1"
            >
              Start building
            </button>
          )}
          {index > 0 && (
            <Button
              onClick={() => setIndex(i => i - 1)}
              className="h-auto py-2 px-3 text-[13px] bg-ink-100 hover:bg-ink-200 text-ink-700 border border-ink-200"
            >
              <ChevronLeft size={15} />
              Back
            </Button>
          )}
          <Button
            onClick={() => (isLast ? startTour() : setIndex(i => i + 1))}
            className="h-auto py-2 px-3.5 text-[13px] font-semibold bg-primary hover:bg-primary/85 text-white border-0"
          >
            {isLast ? 'Launch guided tour' : 'Next'}
            {!isLast && <ChevronRight size={15} />}
          </Button>
        </div>
      </div>
    </div>
  );
};
