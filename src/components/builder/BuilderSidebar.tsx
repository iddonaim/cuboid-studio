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
    <>
      <p className="text-slate-500 text-xs mb-3">
        {CUBE_VARIATIONS.length} variations {'\u2022'} {placedCubes.length} placed
        {isGenerating && <span className="text-amber-400"> {'\u2022'} Generating...</span>}
      </p>

      <RulesToggle enabled={rulesEnabled} onChange={setRulesEnabled} />
      <StrictRulesToggle
        enabled={strictRulesEnabled}
        onChange={setStrictRulesEnabled}
        disabled={!rulesEnabled}
      />

      {/* Install PWA section */}
      <div className={`mb-3 p-2.5 rounded-md border ${
        showInstallButton
          ? 'bg-gradient-to-br from-blue-500 to-blue-600 border-blue-800'
          : 'bg-card border-slate-700'
      }`}>
        {showInstallButton ? (
          <Button
            onClick={handleInstallClick}
            className="w-full h-auto p-0 text-xs font-semibold text-white bg-transparent hover:bg-transparent border-0 flex items-center justify-center gap-1.5"
          >
            Install App
          </Button>
        ) : (
          <div className="text-[11px] text-muted-foreground leading-[1.5]">
            <div className="font-semibold mb-1 text-slate-200">Install as App</div>
            <div className="text-[10px]">
              Chrome: Menu {'\u22EE'} {'\u2192'} <span className="text-blue-400">Install Cuboid Studio</span>
            </div>
          </div>
        )}
      </div>

      {/* Variation thumbnail grid */}
      <ScrollArea className={isMobile ? 'max-h-[200px]' : 'flex-1'}>
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

      {/* Undo/Redo buttons */}
      <div className="flex gap-2 mt-3">
        <Button
          onClick={undo}
          disabled={historyIndex <= 0}
          className="flex-1 h-auto py-2 text-[11px] bg-card border border-slate-700 rounded-md text-muted-foreground hover:bg-slate-700 disabled:text-slate-600"
        >
          Undo
        </Button>
        <Button
          onClick={redo}
          disabled={historyIndex >= history.length - 1}
          className="flex-1 h-auto py-2 text-[11px] bg-card border border-slate-700 rounded-md text-muted-foreground hover:bg-slate-700 disabled:text-slate-600"
        >
          Redo
        </Button>
      </div>

      <SectionCutControls />

      {/* Auto-fill (Grow) buttons */}
      <Separator className="mt-3 bg-slate-700" />
      <div className="mt-3">
        <p className="text-slate-500 text-[11px] mb-2">
          Grow {selectedCubeId ? 'from selected' : '(random)'}
        </p>
        <div className="flex gap-1.5">
          {[5, 10, 25].map(count => (
            <Button
              key={count}
              onClick={() => handleAutoFill(count)}
              className="flex-1 h-auto py-2 text-[11px] bg-emerald-800 hover:bg-emerald-700 text-white border-0"
            >
              +{count}
            </Button>
          ))}
        </div>
      </div>

      {placedCubes.length > 0 && (
        <Button
          onClick={handleClearAll}
          className="mt-2 w-full h-auto py-2.5 text-xs bg-red-900 hover:bg-red-800 text-white border-0"
        >
          Clear All
        </Button>
      )}
    </>
  );
};
