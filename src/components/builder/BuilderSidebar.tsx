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
import { ConnectionViolationNotice } from '../viewport/ConnectionViolationNotice';
import { toCheckableCubes } from '../../lib/cube/connectionViolations';
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
  const showInstallButton = useBuilderStore(s => s.showInstallButton);
  const deferredPrompt = useBuilderStore(s => s.deferredPrompt);
  const setDeferredPrompt = useBuilderStore(s => s.setDeferredPrompt);
  const setShowInstallButton = useBuilderStore(s => s.setShowInstallButton);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallButton(false);
  };

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
          {/* The toggles above govern interactive placement only. This reports
              refusals already in the assembly — from an encode, a remix or a
              restore — which those toggles never saw. */}
          <div className="mt-2">
            <ConnectionViolationNotice
              cubes={toCheckableCubes(placedCubes)}
              subject="this assembly"
            />
          </div>
        </Section>

        {/* Install PWA section */}
        <Section id="builder-install" title="Install app">
        <div className={`mb-3 p-2.5 rounded-md border ${
          showInstallButton
            ? 'bg-gradient-to-br from-primary to-primary border-primary/40'
            : 'bg-card border-ink-200'
        }`}>
          {showInstallButton ? (
            <Button
              onClick={handleInstallClick}
              className="w-full h-auto p-0 text-[13px] font-semibold text-ink-900 bg-transparent hover:bg-transparent border-0 flex items-center justify-center gap-1.5"
            >
              Install App
            </Button>
          ) : (
            <div className="text-[12px] text-muted-foreground leading-[1.5]">
              <div className="font-semibold mb-1 text-ink-800">Install as App</div>
              <div className="text-[11px]">
                Chrome: Menu {'\u22EE'} {'\u2192'} <span className="text-primary">Install Cuboid Studio</span>
              </div>
            </div>
          )}
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
