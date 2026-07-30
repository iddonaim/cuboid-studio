import React from 'react';
import { CUBE_VARIATIONS } from '../../lib/cube/specifications';
import { useBuilderStore } from '../../store/useBuilderStore';
import { CubeThumbnail } from './CubeThumbnail';
import { RulesToggle } from './RulesToggle';
import { StrictRulesToggle } from './StrictRulesToggle';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SectionCutControls } from '../viewport/SectionCutControls';
import { ConnectionReading } from '../viewport/ConnectionReading';
import { findPlacementBlockers, toCheckableCubes } from '../../lib/cube/connectionViolations';
import { getAllRotations } from '../../lib/cube/connectionRules';
import { Section } from '@/components/ui/section';

export const BuilderSidebar: React.FC = () => {
  const isMobile = useIsMobile();
  const selectedIdx = useBuilderStore(s => s.selectedIdx);
  const setSelectedIdx = useBuilderStore(s => s.setSelectedIdx);
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const isGenerating = useBuilderStore(s => s.isGenerating);
  const rulesEnabled = useBuilderStore(s => s.rulesEnabled);
  const setRulesEnabled = useBuilderStore(s => s.setRulesEnabled);
  const strictRulesEnabled = useBuilderStore(s => s.strictRulesEnabled);
  const setStrictRulesEnabled = useBuilderStore(s => s.setStrictRulesEnabled);
  const historyIndex = useBuilderStore(s => s.historyIndex);
  const history = useBuilderStore(s => s.history);
  const undo = useBuilderStore(s => s.undo);
  const redo = useBuilderStore(s => s.redo);
  const handleAutoFill = useBuilderStore(s => s.handleAutoFill);
  const handleClearAll = useBuilderStore(s => s.handleClearAll);
  const selectedCubeId = useBuilderStore(s => s.selectedCubeId);
  const hoverPos = useBuilderStore(s => s.hoverPos);
  const pickerActive = useBuilderStore(s => s.pickerActive);
  const confirmPlacement = useBuilderStore(s => s.confirmPlacement);
  const previewRotation = useBuilderStore(s => s.previewRotation);

  // What the rules allow at the hovered cell, stated as options rather than a
  // verdict: the point of the connection law is that different rotations are
  // real, distinguishable choices, so the count of fitting rotations is the
  // useful number — and when none fit, which neighbour is refusing.
  const rotationFit = React.useMemo(() => {
    if (!rulesEnabled || !hoverPos) return null;
    const store = useBuilderStore.getState();
    const fitting = store.getValidRotations().length;
    return {
      fitting,
      total: getAllRotations().length,
      currentFits: store.getPlacementValidity().valid,
      blockers: fitting === 0 ? findPlacementBlockers(hoverPos, toCheckableCubes(placedCubes)) : [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rulesEnabled, hoverPos, placedCubes, strictRulesEnabled, selectedIdx, previewRotation]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-shrink-0">
        <p className="text-ink-500 text-[13px] mb-3">
          {CUBE_VARIATIONS.length} variations {'\u2022'} {placedCubes.length} placed
          {isGenerating && <span className="text-amber-600"> {'\u2022'} Generating...</span>}
        </p>

        <Section id="builder-rules" title="Connection rules">
          <RulesToggle enabled={rulesEnabled} onChange={setRulesEnabled} />
          <StrictRulesToggle
            enabled={strictRulesEnabled}
            onChange={setStrictRulesEnabled}
            disabled={!rulesEnabled}
          />
          {/* The toggles above govern interactive placement only. This reads
              the assembly as it stands — including cubes that arrived from an
              encode, a remix or a restore, which those toggles never saw. */}
          <div className="mt-2 flex flex-col gap-2">
            {rotationFit && (
              <div className="border border-ink-200 bg-ink-50/80 rounded-md px-2.5 py-1.5 text-[11px] text-ink-500">
                {rotationFit.fitting === 0 ? (
                  <>
                    <span className="text-ink-700">No rotation fits here.</span>{' '}
                    {rotationFit.blockers.length > 0
                      ? `${rotationFit.blockers
                          .map(b => `${b.neighbourVariationId} presents a shell (${b.axis})`)
                          .join(' · ')} — a shell refuses every cutter, so turning the cube can't help.`
                      : 'No single rotation satisfies every neighbour of this cell.'}
                  </>
                ) : (
                  <>
                    <span className={rotationFit.currentFits ? 'text-ink-700' : 'text-primary'}>
                      {rotationFit.currentFits
                        ? 'This rotation fits.'
                        : "This rotation doesn't fit."}
                    </span>{' '}
                    {rotationFit.fitting} of {rotationFit.total} rotations do — Space cycles
                    them.
                  </>
                )}
              </div>
            )}
            <ConnectionReading cubes={toCheckableCubes(placedCubes)} />
          </div>
        </Section>

      </div>

      {/* Pinned actions — always above the variation grid */}
      <div className="flex-shrink-0 pb-3">
        <div className="flex gap-2">
          <Button
            onClick={undo}
            disabled={historyIndex <= 0}
            className="flex-1 h-auto py-2 text-[12px] bg-card border border-ink-200 rounded-md text-muted-foreground hover:bg-ink-200 disabled:text-ink-400"
          >
            Undo
          </Button>
          <Button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="flex-1 h-auto py-2 text-[12px] bg-card border border-ink-200 rounded-md text-muted-foreground hover:bg-ink-200 disabled:text-ink-400"
          >
            Redo
          </Button>
        </div>

        <SectionCutControls showSeparator={false} />

        {isMobile && (
          <Button
            onClick={confirmPlacement}
            disabled={!pickerActive || !hoverPos || !!selectedCubeId}
            className="mt-2 w-full h-auto py-2.5 text-[13px] bg-primary hover:bg-primary/85 text-white border-0 disabled:bg-ink-100 disabled:text-ink-400"
          >
            Place
          </Button>
        )}

        <Separator className="mt-3 bg-ink-200" />
        <div className="mt-3">
          <p className="text-ink-500 text-[12px] mb-2">
            Grow {selectedCubeId ? 'from selected' : '(random)'}
          </p>
          <div className="flex gap-1.5">
            {[5, 10, 25].map(count => (
              <Button
                key={count}
                onClick={() => handleAutoFill(count)}
                className="flex-1 h-auto py-2 text-[12px] bg-primary/10 hover:bg-primary/20 text-primary border-0"
              >
                +{count}
              </Button>
            ))}
          </div>
        </div>

        {placedCubes.length > 0 && (
          <Button
            onClick={handleClearAll}
            className="mt-2 w-full h-auto py-2.5 text-[13px] bg-destructive/10 hover:bg-destructive/20 text-white border-0"
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Variation thumbnail grid */}
      {isMobile ? (
        <div className="flex-shrink-0 flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {CUBE_VARIATIONS.map((v, i) => (
            <div key={v.id} className="flex-shrink-0">
              <CubeThumbnail
                variation={v}
                selected={selectedIdx === i}
                onClick={() => setSelectedIdx(i)}
              />
            </div>
          ))}
        </div>
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div className="grid grid-cols-3 gap-1.5 p-1">
            {CUBE_VARIATIONS.map((v, i) => (
              <CubeThumbnail
                key={v.id}
                variation={v}
                selected={selectedIdx === i}
                onClick={() => setSelectedIdx(i)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};
