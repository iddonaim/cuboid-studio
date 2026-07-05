import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { AppMode, useAppStore } from '../../store/useAppStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Button } from '@/components/ui/button';

/* ────────────────────────────────────────────────────────────────────────
 * Guided tour — an interactive walkthrough that spotlights live UI elements
 * one at a time. A dimming overlay with a cut-out "spotlight" glides between
 * targets (elements tagged with data-tour="..."), while each step also drives
 * the app itself (switching mode tabs, opening the sidebar) so the user sees
 * every stage of the pipeline for real, not as a screenshot.
 *
 * Launched from the OnboardingModal ("Launch guided tour") via
 * useAppStore.startTour(). Steps whose target never appears (signed-out,
 * different layout) are skipped automatically after a short grace period.
 * ──────────────────────────────────────────────────────────────────────── */

interface TourStep {
  /** data-tour attribute value of the element to spotlight. */
  target: string;
  /** Alternate target on the mobile layout (defaults to `target`). */
  mobileTarget?: string;
  title: string;
  body: string;
  bodyMobile?: string;
  /** Drive the app so the target exists and shows the right surface. */
  before?: () => void;
  desktopOnly?: boolean;
  /** Extra breathing room around the target, px (default 8). */
  padding?: number;
}

const setMode = (mode: AppMode) => useAppStore.getState().setActiveMode(mode);
const openSidebar = () => {
  const s = useAppStore.getState();
  if (!s.floatingPanelOpen) s.toggleFloatingPanel();
};

const TOUR_STEPS: TourStep[] = [
  {
    target: 'mode-tabs',
    mobileTarget: 'mobile-tabs',
    title: 'Four stages, one pipeline',
    body:
      'Work moves left to right: Map grounds the project in a real site, Encode reads a photographed space, Evolution lets culture push the form, and Decode turns the result into a drawing. This tour visits each one — the app will switch tabs as we go.',
    before: () => setMode('encoding'),
  },
  {
    target: 'canvas-stage',
    title: 'Map — meet the real site',
    body:
      'Every project starts here. Type an address and run the analysis: buildings, streets, transit and demographics become the shared context that every later stage builds on.',
    before: () => setMode('map'),
    padding: 0,
  },
  {
    target: 'sidebar',
    mobileTarget: 'bottom-sheet',
    title: 'Encode — read a space',
    body:
      'Upload 1–7 photos of an inhabited space. The model reads its atmosphere, light, emotion, rhythm and placement, then proposes a cuboid assembly that mirrors that spatial logic.',
    bodyMobile:
      'Tap a tab to open its controls in this sheet. In Encode you upload 1–7 photos of a space; the model reads its atmosphere, light, emotion, rhythm and placement, then proposes a cuboid assembly.',
    before: () => {
      setMode('encoding');
      openSidebar();
    },
  },
  {
    target: 'help-bar',
    title: 'Hints that follow you',
    body:
      'The 3D assembly lives behind this bar. Its hints always match what you are doing — orbiting, placing cubes, cutting sections — so you never have to remember the controls.',
    before: () => setMode('encoding'),
  },
  {
    target: 'evolution-submode',
    mobileTarget: 'bottom-sheet',
    title: 'Evolution — let culture act',
    body:
      'Two engines share this tab. Evolve breeds candidate assemblies and scores them. Pataphysical translates an internet meme into a geometric operation you can preview on the model and apply or undo.',
    before: () => {
      setMode('evolution');
      openSidebar();
    },
  },
  {
    target: 'sidebar',
    mobileTarget: 'bottom-sheet',
    title: 'Decode — make the drawing',
    body:
      'The 3D assembly flattens into a 2D notation canvas. Snap glyph tiles to the grid, rotate them, and export the diagram as SVG or DXF — the basis for intervening on the site.',
    before: () => {
      setMode('decode');
      openSidebar();
    },
  },
  {
    target: 'capture',
    title: 'Capture as you go',
    body:
      'The camera saves a hi-res transparent PNG of the current view at any point — useful for boards and process documentation.',
  },
  {
    target: 'panel-toggle',
    desktopOnly: true,
    title: 'Room to work',
    body:
      'Hide the side panel with this button — or press Cmd/Ctrl+B — for a full-bleed view of the model. Same again to bring it back.',
  },
  {
    target: 'help-button',
    title: 'Replay anytime',
    body:
      'That is the loop: ground → space → culture → drawing. The ? reopens the introduction, and this tour can be launched again from there.',
  },
];

interface SpotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Measure a data-tour target; null if absent or effectively invisible. */
function measureTarget(name: string): SpotRect | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Grace period before a missing target causes the step to be skipped. */
const TARGET_GRACE_MS = 500;

/** Pick a position for the tooltip card around (or, if huge, inside) the spot. */
function cardStyle(spot: SpotRect, vw: number, vh: number): React.CSSProperties {
  const GAP = 14;
  const W = Math.min(348, vw - 24);
  const EST_H = 230; // rough card height used only for choosing a side
  const centeredLeft = Math.min(
    Math.max(spot.left + spot.width / 2 - W / 2, 12),
    Math.max(12, vw - W - 12),
  );
  const below = vh - spot.top - spot.height;
  if (below >= EST_H + GAP) {
    return { top: spot.top + spot.height + GAP, left: centeredLeft, width: W };
  }
  if (spot.top >= EST_H + GAP) {
    return { bottom: vh - spot.top + GAP, left: centeredLeft, width: W };
  }
  const centeredTop = Math.min(
    Math.max(spot.top + spot.height / 2 - EST_H / 2, 12),
    Math.max(12, vh - EST_H - 12),
  );
  if (vw - spot.left - spot.width >= W + GAP + 12) {
    return { top: centeredTop, left: spot.left + spot.width + GAP, width: W };
  }
  if (spot.left >= W + GAP + 12) {
    return { top: centeredTop, right: vw - spot.left + GAP, width: W };
  }
  // Target dominates the screen (e.g. the map canvas) — float inside it.
  return {
    bottom: Math.max(12, vh - spot.top - spot.height + GAP + 44),
    left: centeredLeft,
    width: W,
  };
}

export const GuidedTour: React.FC = () => {
  const active   = useAppStore(s => s.tourActive);
  const endTour  = useAppStore(s => s.endTour);
  const isMobile = useIsMobile();

  const steps = React.useMemo(
    () => (isMobile ? TOUR_STEPS.filter(s => !s.desktopOnly) : TOUR_STEPS),
    [isMobile],
  );

  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<SpotRect | null>(null);
  // Direction of travel, so auto-skipping a missing target keeps moving the
  // same way the user was going (forward on Next, backward on Back).
  const dirRef = useRef<1 | -1>(1);
  const enteredAtRef = useRef(0);

  const step = index < steps.length ? steps[index] : undefined;

  const goto = useCallback(
    (next: number, dir: 1 | -1) => {
      dirRef.current = dir;
      if (next < 0) return;
      if (next >= steps.length) {
        endTour();
        return;
      }
      setIndex(next);
    },
    [steps.length, endTour],
  );

  // Restart from the first step every time the tour is launched.
  useEffect(() => {
    if (active) {
      setIndex(0);
      setSpot(null);
      dirRef.current = 1;
    }
  }, [active]);

  // On step entry: drive the app so the target surface is mounted.
  useEffect(() => {
    if (!active || !step) return;
    enteredAtRef.current = performance.now();
    step.before?.();
  }, [active, index, step]);

  // Track the target's rect every frame while the tour runs. This keeps the
  // spotlight glued to elements that move (sidebar resize, window resize,
  // layout settling after a mode switch) without any observers to wire up.
  useEffect(() => {
    if (!active || !step) return;
    let raf = 0;
    const targetName = isMobile ? (step.mobileTarget ?? step.target) : step.target;
    const tick = () => {
      const r = measureTarget(targetName);
      if (r) {
        setSpot(prev =>
          prev &&
          Math.abs(prev.top - r.top) < 0.5 &&
          Math.abs(prev.left - r.left) < 0.5 &&
          Math.abs(prev.width - r.width) < 0.5 &&
          Math.abs(prev.height - r.height) < 0.5
            ? prev
            : r,
        );
      } else if (performance.now() - enteredAtRef.current > TARGET_GRACE_MS) {
        // Target never showed up on this layout/session — skip past it.
        goto(index + dirRef.current, dirRef.current);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, index, step, isMobile, goto]);

  // Keyboard navigation.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour();
      if (e.key === 'ArrowRight' || e.key === 'Enter') goto(index + 1, 1);
      if (e.key === 'ArrowLeft') goto(index - 1, -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, index, goto, endTour]);

  if (!active || !step) return null;

  const pad = step.padding ?? 8;
  const spotPadded: SpotRect | null = spot
    ? {
        top: spot.top - pad,
        left: spot.left - pad,
        width: spot.width + pad * 2,
        height: spot.height + pad * 2,
      }
    : null;
  const isLast = index === steps.length - 1;
  const body = isMobile && step.bodyMobile ? step.bodyMobile : step.body;

  return (
    <div
      className="fixed inset-0 z-[300]"
      role="dialog"
      aria-modal="true"
      aria-label="Guided tour"
    >
      {/* Full-screen click shield: the tour drives the app itself, so direct
          interaction underneath is blocked while it runs. */}
      <div className="absolute inset-0" />

      {spotPadded ? (
        <div
          className="tour-spotlight absolute rounded-[10px]"
          style={{
            top: spotPadded.top,
            left: spotPadded.left,
            width: spotPadded.width,
            height: spotPadded.height,
          }}
        />
      ) : (
        // Before the first measurement lands, dim uniformly (no hole yet).
        <div
          className="absolute inset-0"
          style={{ background: 'hsl(45 9% 13% / 0.45)' }}
        />
      )}

      {spotPadded && (
        <div
          key={index}
          className="tour-card absolute rounded-xl p-4"
          style={{
            ...cardStyle(spotPadded, window.innerWidth, window.innerHeight),
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            boxShadow: '0 12px 40px hsl(45 9% 13% / 0.25)',
          }}
        >
          <div className="flex items-center mb-1.5">
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink-400 select-none">
              {String(index + 1).padStart(2, '0')} · {String(steps.length).padStart(2, '0')}
            </span>
            <div className="flex-1" />
            <button
              onClick={endTour}
              aria-label="End tour"
              className="bg-transparent border-0 p-0.5 text-ink-400 hover:text-ink-700 cursor-pointer flex items-center"
            >
              <X size={16} />
            </button>
          </div>

          <h3 className="text-[17px] font-semibold text-ink-900 m-0 mb-1.5">{step.title}</h3>
          <p className="text-[14px] text-ink-700 leading-relaxed m-0 mb-3.5">{body}</p>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full ${
                    i === index ? 'bg-primary' : 'bg-ink-300'
                  }`}
                />
              ))}
            </div>
            <div className="flex-1" />
            {index > 0 && (
              <Button
                onClick={() => goto(index - 1, -1)}
                className="h-auto py-2 px-3 text-[13px] bg-ink-100 hover:bg-ink-200 text-ink-700 border border-ink-200"
              >
                <ChevronLeft size={15} />
                Back
              </Button>
            )}
            <Button
              onClick={() => goto(index + 1, 1)}
              className="h-auto py-2 px-3.5 text-[13px] font-semibold bg-primary hover:bg-primary/85 text-white border-0"
            >
              {isLast ? 'Finish' : 'Next'}
              {!isLast && <ChevronRight size={15} />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
