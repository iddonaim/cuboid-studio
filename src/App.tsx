import React, { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { useBuilderStore } from './store/useBuilderStore';
import { useEncodingStore } from './store/useEncodingStore';
import { useEvolutionStore } from './store/useEvolutionStore';
import { USE_PRECOMPUTED_MODELS, preGenerateAllGeometries } from './lib/cube/csgUtils';
import { getAllRotations, findRotationIndex, AxisRotation } from './lib/cube/connectionRules';
import { TopBar } from './components/layout/TopBar';
import { FloatingPanel } from './components/layout/FloatingPanel';
import { BottomSheet } from './components/layout/BottomSheet';
import { HelpBar } from './components/layout/HelpBar';
import { useIsMobile } from './hooks/useIsMobile';
import { Viewport3D } from './components/viewport/Viewport3D';
import { BuilderSidebar } from './components/builder/BuilderSidebar';
import { SelectedCubePanel } from './components/builder/SelectedCubePanel';
import { TaggingPanel } from './components/builder/TaggingPanel';
import { useTagStore } from './store/useTagStore';
import { MemeInputPanel } from './components/meme/MemeInputPanel';
import { OperatorResultPanel } from './components/meme/OperatorResultPanel';
import { OperatorHistoryList } from './components/meme/OperatorHistoryList';
import { CutterTweakPanel } from './components/meme/CutterTweakPanel';
import { EncodingPanel } from './components/encoding/EncodingPanel';
import { EncodingResultPanel } from './components/encoding/EncodingResultPanel';
import { EvolutionPanel } from './components/evolution/EvolutionPanel';
import { ExportPanel } from './components/export/ExportPanel';
import { DecodePanel } from './components/decode/DecodePanel';
import { MapContextCanvas } from './components/map/MapContextCanvas';
import { CaptureButton } from './components/tools/CaptureButton';
import { Button } from '@/components/ui/button';
import { setActiveSiteContext, SiteContextData } from './lib/storage/siteContext';

/**
 * Banner rendered above the BuilderSidebar when the user has opened the
 * seed-edit overlay from Encode → Merge. "Done" closes the overlay and
 * re-snapshots the current Builder placedCubes into the merge seed.
 */
const SeedEditBanner: React.FC = () => {
  const closeSeedEdit = useEncodingStore(s => s.closeSeedEdit);
  return (
    <div
      className="mb-2 p-2 rounded-md flex items-center justify-between gap-2"
      style={{
        background: 'rgba(16, 185, 129, 0.08)',
        border: '1px solid rgba(16, 185, 129, 0.35)',
      }}
    >
      <div className="flex flex-col">
        <span className="text-emerald-400 text-[10px] font-semibold uppercase tracking-wider">
          Editing merge seed
        </span>
        <span className="text-slate-400 text-[10px]">
          Changes here become the seed for Encode.
        </span>
      </div>
      <Button
        onClick={closeSeedEdit}
        className="h-auto py-1.5 px-2.5 text-[11px] bg-emerald-700 hover:bg-emerald-600 text-white border-0"
      >
        Done
      </Button>
    </div>
  );
};

/**
 * Small in-panel toggle between Evolution's two sub-modes.
 * Lives at the top of the Evolution surface (panel or sheet).
 */
const EvolutionSubModeToggle: React.FC = () => {
  const subMode = useEvolutionStore(s => s.subMode);
  const setSubMode = useEvolutionStore(s => s.setSubMode);
  const tabs: { value: 'evolve' | 'pataphysical'; label: string }[] = [
    { value: 'evolve',       label: 'Evolve' },
    { value: 'pataphysical', label: 'Pataphysical' },
  ];
  return (
    <div className="flex gap-1 mb-2.5">
      {tabs.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setSubMode(value)}
          className={`flex-1 py-1.5 px-1 rounded-md text-[10px] border cursor-pointer ${
            subMode === value
              ? 'bg-blue-950 border-blue-500 text-blue-300 font-semibold'
              : 'bg-slate-800 border-slate-700 text-slate-500'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

/** Pataphysical surface as a contextual sub-mode within Evolution. */
const PataphysicalSurface: React.FC = () => (
  <div className="flex flex-col gap-2.5">
    <MemeInputPanel />
    <CutterTweakPanel />
    <OperatorHistoryList />
  </div>
);

const SiteAnalysisToast: React.FC<{ onGoToEncode: () => void }> = ({ onGoToEncode }) => (
  <div
    className="absolute bottom-4 right-4 z-[70] max-w-sm rounded-md border px-3 py-2 text-[11px] text-slate-200 shadow-xl"
    style={{
      background: 'rgba(15, 23, 42, 0.94)',
      borderColor: 'rgba(148, 163, 184, 0.35)',
    }}
  >
    <div className="mb-2">Site analysis ready — continue to Encode whenever you'd like.</div>
    <Button
      onClick={onGoToEncode}
      className="h-auto py-1.5 px-2.5 text-[10px] bg-blue-900 hover:bg-blue-800 text-white border-0"
    >
      Go to Encode
    </Button>
  </div>
);

const DecodeTagsOverlay: React.FC = () => {
  const compositionTags = useTagStore(s => s.compositionTags);
  if (compositionTags.length === 0) return null;
  return (
    <div className="absolute bottom-8 left-4 z-20 max-w-[220px] rounded-lg border border-slate-700 p-3" style={{ background: 'rgba(15,23,42,0.85)' }}>
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
        Composition tags
      </p>
      <div className="flex flex-wrap gap-1">
        {compositionTags.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] bg-slate-800 border border-slate-600 text-slate-300"
          >
            {tag.word}
            <span className="text-slate-500">· {tag.intensity}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const activeMode          = useAppStore(s => s.activeMode);
  const setActiveMode       = useAppStore(s => s.setActiveMode);
  const floatingPanelOpen   = useAppStore(s => s.floatingPanelOpen);
  const seedEditOpen        = useEncodingStore(s => s.seedEditOpen);
  const evolutionSubMode    = useEvolutionStore(s => s.subMode);
  const isMobile            = useIsMobile();
  const [showSiteToast, setShowSiteToast] = React.useState(false);

  // Convenience predicates for what to mount.
  const showBuilderSurface     = activeMode === 'encoding' && seedEditOpen;
  const showPataphysicalSurface = activeMode === 'evolution' && evolutionSubMode === 'pataphysical';
  const showMapCanvas = activeMode === 'map';

  // Pre-generate geometries on mount (CSG mode only)
  useEffect(() => {
    if (USE_PRECOMPUTED_MODELS) {
      console.log('Using pre-computed GLB models, skipping CSG generation');
      useBuilderStore.getState().setIsGenerating(false);
      return;
    }
    const timer = setTimeout(() => {
      try { preGenerateAllGeometries(); } catch (e) { console.error('Error pre-generating:', e); }
      useBuilderStore.getState().setIsGenerating(false);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // PWA install prompt handler
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      useBuilderStore.getState().setDeferredPrompt(e);
      useBuilderStore.getState().setShowInstallButton(true);
    };
    const handleAppInstalled = () => {
      useBuilderStore.getState().setShowInstallButton(false);
      useBuilderStore.getState().setDeferredPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const store = useBuilderStore.getState();

      if (e.key === 'Escape') {
        store.setPickerActive(false);
        store.setHoverPos(null);
        store.setHoverInfo(null);
        store.setSelectedCubeIds([]);
      }

      if (e.key === ' ' && store.pickerActive && store.hoverPos) {
        e.preventDefault();
        const validRotations = store.getValidRotations();
        const rotationsToUse = validRotations.length > 0 ? validRotations : getAllRotations();
        store.setPreviewRotation(prev => {
          const currentRotation = findRotationIndex(validRotations, prev) === -1 && validRotations.length > 0
            ? validRotations[0]
            : prev;
          const currentIdx = findRotationIndex(rotationsToUse, currentRotation);
          if (currentIdx === -1) return rotationsToUse[0];
          return rotationsToUse[(currentIdx + 1) % rotationsToUse.length];
        });
      }

      if (e.key === 'r' && store.pickerActive && store.hoverPos) {
        e.preventDefault();
        store.setPreviewRotation(prev => ({
          ...prev,
          x: ((prev.x + 1) % 4) as AxisRotation,
        }));
      }

      if (e.key === ' ' && store.selectedCubeIds.length > 0 && !store.pickerActive) {
        e.preventDefault();
        store.rotateSelectedCube('y');
      }

      if (e.key === 'r' && store.selectedCubeIds.length > 0 && !store.pickerActive) {
        e.preventDefault();
        store.rotateSelectedCube('x');
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        store.redo();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedCubeIds.length > 0) {
        e.preventDefault();
        store.handleDelete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      // mobile-root uses 100dvh (dynamic viewport height) for iOS Safari compatibility.
      // Flex-column layout: TopBar spacer → viewport (flex-1) → BottomSheet.
      <div className="mobile-root flex flex-col w-screen">
        {/* TopBar: fixed at top, mobile variant shows logo + cube count only */}
        <TopBar showModeTabs={false} />

        {/* 42 px spacer because TopBar is position:fixed and doesn't occupy flow */}
        <div style={{ height: 42, flexShrink: 0 }} aria-hidden />

        {/* Viewport area: transform:translateZ(0) creates GPU compositing boundary
            so the WebGL canvas cannot visually bleed over the sibling BottomSheet. */}
        <div className="flex-1 min-h-0 relative overflow-hidden [transform:translateZ(0)]">
          {showMapCanvas ? (
            <MapContextCanvas
              onAnalysisComplete={(context: SiteContextData) => {
                setActiveSiteContext(context);
                setShowSiteToast(true);
              }}
            />
          ) : (
            <>
              <Viewport3D />
              {/* Encoding: BuilderScene overlay shows SelectedCubePanel;
                  otherwise the standard EncodingResultPanel */}
              {activeMode === 'encoding' && (
                showBuilderSurface ? <SelectedCubePanel /> : <EncodingResultPanel />
              )}
              {/* Evolution: Pataphysical sub-mode swaps in OperatorResultPanel */}
              {showPataphysicalSurface && <OperatorResultPanel />}
              {/* Decode: read-only composition tags overlay on the 3D background */}
              {activeMode === 'decode' && <DecodeTagsOverlay />}
              <CaptureButton />
              <HelpBar />
            </>
          )}
          {showSiteToast && (
            <SiteAnalysisToast
              onGoToEncode={() => {
                setShowSiteToast(false);
                setActiveMode('encoding');
              }}
            />
          )}
        </div>

        {/* BottomSheet contains mode content + MobileTabBar */}
        {!showMapCanvas && (
          <BottomSheet>
            {activeMode === 'encoding' && (
              showBuilderSurface ? (
                <>
                  <SeedEditBanner />
                  <BuilderSidebar />
                  <TaggingPanel />
                </>
              ) : (
                <EncodingPanel />
              )
            )}
            {activeMode === 'evolution' && (
              <>
                <EvolutionSubModeToggle />
                {evolutionSubMode === 'evolve'
                  ? <EvolutionPanel />
                  : <PataphysicalSurface />}
              </>
            )}
            {activeMode === 'decode' && <DecodePanel />}
            {activeMode !== 'decode' && <ExportPanel />}
          </BottomSheet>
        )}
      </div>
    );
  }

  // ── Desktop layout ─────────────────────────────────────────────────────────
  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* TopBar: fixed glass bar, full width */}
      <TopBar />

      {/* Viewport: full bleed behind all overlays.
          transform:translateZ(0) keeps the WebGL layer below React overlays. */}
      <div className="absolute inset-0 overflow-hidden [transform:translateZ(0)]">
        {showMapCanvas ? (
          <MapContextCanvas
            onAnalysisComplete={(context: SiteContextData) => {
              setActiveSiteContext(context);
              setShowSiteToast(true);
            }}
          />
        ) : (
          <>
            <Viewport3D />
            {activeMode === 'encoding' && (
              showBuilderSurface ? <SelectedCubePanel /> : <EncodingResultPanel />
            )}
            {showPataphysicalSurface && <OperatorResultPanel />}
            {activeMode === 'decode' && <DecodeTagsOverlay />}
            <CaptureButton />
            <HelpBar />
          </>
        )}
        {showSiteToast && (
          <SiteAnalysisToast
            onGoToEncode={() => {
              setShowSiteToast(false);
              setActiveMode('encoding');
            }}
          />
        )}
      </div>

      {/* FloatingPanel: glass overlay on the left side */}
      {!showMapCanvas && (
        <FloatingPanel
          mode={activeMode}
          isOpen={floatingPanelOpen}
          exportSlot={activeMode === 'decode' ? undefined : <ExportPanel />}
        >
          {activeMode === 'encoding' && (
            showBuilderSurface ? (
              <>
                <SeedEditBanner />
                <BuilderSidebar />
              </>
            ) : (
              <EncodingPanel />
            )
          )}
          {activeMode === 'evolution' && (
            <>
              <EvolutionSubModeToggle />
              {evolutionSubMode === 'evolve'
                ? <EvolutionPanel />
                : <PataphysicalSurface />}
            </>
          )}
          {activeMode === 'decode' && <DecodePanel />}
        </FloatingPanel>
      )}
    </div>
  );
};

export default App;
