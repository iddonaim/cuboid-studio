import React, { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { useBuilderStore } from './store/useBuilderStore';
import { useEncodingStore } from './store/useEncodingStore';
import { useEvolutionStore } from './store/useEvolutionStore';
import { USE_PRECOMPUTED_MODELS, preGenerateAllGeometries } from './lib/cube/csgUtils';
import { getAllRotations, findRotationIndex, AxisRotation } from './lib/cube/connectionRules';
import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/layout/Sidebar';
import { Inspector } from './components/layout/Inspector';
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
import { CubeChangeCard } from './components/evolution/CubeChangeCard';
import { ExportPanel } from './components/export/ExportPanel';
import { DecodePanel } from './components/decode/DecodePanel';
import { MapContextCanvas } from './components/map/MapContextCanvas';
import { SitesMapView } from './components/map/SitesMapView';
import { MapViewToggle } from './components/map/MapViewToggle';
import { CaptureButton } from './components/tools/CaptureButton';
import { Button } from '@/components/ui/button';
import { setActiveSiteContext, SiteContextData } from './lib/storage/siteContext';
import { AuthProvider, useAuthContext } from './contexts/AuthContext';
import { AccentProvider } from './contexts/AccentContext';
import { ProjectsPanel } from './components/projects/ProjectsPanel';
import { ToastContainer } from './components/layout/ToastContainer';
import { RecordViewerDrawer } from './components/meme/TranslationRecord';
import { Section } from '@/components/ui/section';
import { OnboardingModal } from './components/onboarding/OnboardingModal';
import { GuidedTour } from './components/onboarding/GuidedTour';
import { ApiActivityIndicator } from './components/layout/ApiActivityIndicator';
import { isDemoMode } from './lib/demo/demoMode';
import { DemoExportButton } from './components/demo/DemoExportButton';

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
        background: 'hsl(var(--primary) / 0.07)',
        border: '1px solid hsl(var(--primary) / 0.35)',
      }}
    >
      <div className="flex flex-col">
        <span className="text-primary text-[11px] font-semibold uppercase tracking-wider">
          Editing merge seed
        </span>
        <span className="text-ink-600 text-[11px]">
          Changes here become the seed for Encode.
        </span>
      </div>
      <Button
        onClick={closeSeedEdit}
        className="h-auto py-1.5 px-2.5 text-[12px] bg-primary hover:bg-primary/85 text-white border-0"
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
    <div className="flex gap-1 mb-2.5" data-tour="evolution-submode">
      {tabs.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setSubMode(value)}
          className={`flex-1 py-1.5 px-1 rounded-md text-[11px] border cursor-pointer ${
            subMode === value
              ? 'bg-primary/10 border-primary text-primary font-semibold'
              : 'bg-ink-100 border-ink-200 text-ink-500'
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
    <Section id="pata-history" title="Operator history">
      <OperatorHistoryList />
    </Section>
  </div>
);

const SiteAnalysisToast: React.FC<{ onGoToEncode: () => void }> = ({ onGoToEncode }) => (
  <div
    className="absolute bottom-4 right-4 z-[70] max-w-sm rounded-md border px-3 py-2 text-[12px] text-ink-800 shadow-xl"
    style={{
      background: 'hsl(var(--card) / 0.96)',
      borderColor: 'hsl(var(--border))',
      boxShadow: '0 6px 24px hsl(45 9% 13% / 0.12)',
    }}
  >
    <div className="mb-2">Site analysis ready — continue to Encode whenever you'd like.</div>
    <Button
      onClick={onGoToEncode}
      className="h-auto py-1.5 px-2.5 text-[11px] bg-primary hover:bg-primary/85 text-white border-0"
    >
      Go to Encode
    </Button>
  </div>
);

const DecodeTagsOverlay: React.FC = () => {
  const compositionTags = useTagStore(s => s.compositionTags);
  if (compositionTags.length === 0) return null;
  return (
    <div className="absolute bottom-8 left-4 z-20 max-w-[220px] rounded-lg border border-ink-200 p-3" style={{ background: 'hsl(var(--card) / 0.9)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-600 mb-1.5">
        Composition tags
      </p>
      <div className="flex flex-wrap gap-1">
        {compositionTags.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] bg-ink-100 border border-ink-300 text-ink-700"
          >
            {tag.word}
            <span className="text-ink-500">· {tag.intensity}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

const AppInner: React.FC = () => {
  const activeMode          = useAppStore(s => s.activeMode);
  const setActiveMode       = useAppStore(s => s.setActiveMode);
  const floatingPanelOpen   = useAppStore(s => s.floatingPanelOpen);
  const seedEditOpen        = useEncodingStore(s => s.seedEditOpen);
  const evolutionSubMode    = useEvolutionStore(s => s.subMode);
  const isMobile            = useIsMobile();
  const { user }            = useAuthContext();
  const [showSiteToast, setShowSiteToast] = React.useState(false);
  // Map tab sub-view: the analysis iframe or the signed-in "My sites" layer.
  // Lives in the app store so the TopBar can render the switch.
  const mapView    = useAppStore(s => s.mapView);
  const setMapView = useAppStore(s => s.setMapView);

  // Convenience predicates for what to mount.
  const showBuilderSurface     = activeMode === 'encoding' && seedEditOpen;
  const showPataphysicalSurface = activeMode === 'evolution' && evolutionSubMode === 'pataphysical';
  const showMapCanvas = activeMode === 'map';
  // Offline demo: the sites map reads the bundled fixture, so no user is needed.
  const showSitesMap  = showMapCanvas && mapView === 'sites' && (!!user || isDemoMode());

  // Signing out while on "My sites" falls back to the analysis view.
  useEffect(() => {
    if (!user && !isDemoMode()) setMapView('analyze');
  }, [user]);

  // Offline demo: open straight on the sites map — the demo's entry beat.
  useEffect(() => {
    if (isDemoMode()) {
      setActiveMode('map');
      setMapView('sites');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      // Cmd/Ctrl+B toggles the sidebar (desktop)
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        useAppStore.getState().toggleFloatingPanel();
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

        {/* Spacer because TopBar is position:fixed and doesn't occupy flow —
            must match the TopBar's own height calc (42px + top safe area). */}
        <div style={{ height: 'calc(42px + env(safe-area-inset-top, 0px))', flexShrink: 0 }} aria-hidden />

        {/* Viewport area: transform:translateZ(0) creates GPU compositing boundary
            so the WebGL canvas cannot visually bleed over the sibling BottomSheet. */}
        <div className="flex-1 min-h-0 relative overflow-hidden [transform:translateZ(0)]" data-tour="canvas-stage">
          {/* Kept mounted (just hidden) instead of unmounted when leaving Map
              mode — the embedded map-context app runs its own address search
              and analysis run inside this iframe, and destroying the iframe
              on every tab switch was wiping that in-progress state. */}
          <div className={showMapCanvas && !showSitesMap ? undefined : 'hidden'}>
            <MapContextCanvas
              onAnalysisComplete={(context: SiteContextData) => {
                setActiveSiteContext(context);
                setShowSiteToast(true);
              }}
            />
          </div>
          {showSitesMap && <SitesMapView />}
          {showMapCanvas && (user || isDemoMode()) && <MapViewToggle />}
          {!showMapCanvas && (
            <>
              <Viewport3D />
              {/* Encoding: BuilderScene overlay shows SelectedCubePanel;
                  otherwise the standard EncodingResultPanel */}
              {activeMode === 'encoding' && (
                showBuilderSurface ? <SelectedCubePanel /> : <EncodingResultPanel />
              )}
              {/* Evolution: Pataphysical sub-mode swaps in OperatorResultPanel;
                  Evolve sub-mode shows the clicked cube's change record */}
              {showPataphysicalSurface && <OperatorResultPanel />}
              {activeMode === 'evolution' && evolutionSubMode === 'evolve' && <CubeChangeCard />}
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

        {/* BottomSheet contains mode content + MobileTabBar. Always mounted —
            MobileTabBar is the *only* way to switch tabs on this layout, so it
            must stay reachable even while in Map mode (it used to unmount
            itself the instant you tapped into Map, with no way back). */}
        <BottomSheet forceCollapsed={showMapCanvas}>
          {!showMapCanvas && (
            <>
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
            </>
          )}
        </BottomSheet>
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
      <div className="absolute inset-0 overflow-hidden [transform:translateZ(0)]" data-tour="canvas-stage">
        {/* Kept mounted (just hidden) instead of unmounted when leaving Map
            mode — see matching comment in the mobile layout above. */}
        <div className={showMapCanvas && !showSitesMap ? undefined : 'hidden'}>
          <MapContextCanvas
            onAnalysisComplete={(context: SiteContextData) => {
              setActiveSiteContext(context);
              setShowSiteToast(true);
            }}
          />
        </div>
        {showSitesMap && <SitesMapView />}
        {/* Desktop: the Analysis / My sites switch lives in the TopBar, so
            nothing floats over the map-context iframe's own toolbar. */}
        {!showMapCanvas && (
          <>
            <Viewport3D />
            {/* Results dock into the right-side Inspector rail on desktop */}
            <Inspector>
              {activeMode === 'encoding' && (
                showBuilderSurface ? <SelectedCubePanel docked /> : <EncodingResultPanel docked />
              )}
              {showPataphysicalSurface && <OperatorResultPanel docked />}
              {activeMode === 'evolution' && evolutionSubMode === 'evolve' && (
                <CubeChangeCard docked />
              )}
            </Inspector>
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

      {/* Docked sidebar on the left (Cmd/Ctrl+B or TopBar button to toggle) */}
      {!showMapCanvas && (
        <Sidebar
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
        </Sidebar>
      )}
    </div>
  );
};

/**
 * App shell — wraps the existing UI in the AuthProvider and mounts the
 * cross-cutting overlays (Projects slide-over, toasts). These all render
 * nothing for logged-out / unconfigured users, so the base experience is
 * unchanged. "Save to project" lives inside the TopBar.
 */
const App: React.FC = () => (
  <AuthProvider>
    <AccentProvider>
    <AppInner />
    {/* Full-reading drawer for translation records — one instance app-wide */}
    <RecordViewerDrawer />
    <ProjectsPanel />
    <ToastContainer />
    <ApiActivityIndicator />
    <DemoExportButton />
    <OnboardingModal />
    <GuidedTour />
    </AccentProvider>
  </AuthProvider>
);

export default App;
