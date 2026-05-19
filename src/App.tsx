import React, { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { useBuilderStore } from './store/useBuilderStore';
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
import { MemeInputPanel } from './components/meme/MemeInputPanel';
import { OperatorResultPanel } from './components/meme/OperatorResultPanel';
import { OperatorHistoryList } from './components/meme/OperatorHistoryList';
import { CutterTweakPanel } from './components/meme/CutterTweakPanel';
import { EncodingPanel } from './components/encoding/EncodingPanel';
import { EncodingResultPanel } from './components/encoding/EncodingResultPanel';
import { EvolutionPanel } from './components/evolution/EvolutionPanel';
import { ExportPanel } from './components/export/ExportPanel';
import { CaptureButton } from './components/tools/CaptureButton';

const App: React.FC = () => {
  const activeMode        = useAppStore(s => s.activeMode);
  const floatingPanelOpen = useAppStore(s => s.floatingPanelOpen);
  const isMobile          = useIsMobile();

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
        store.setSelectedCubeId(null);
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

      if (e.key === ' ' && store.selectedCubeId && !store.pickerActive) {
        e.preventDefault();
        store.rotateSelectedCube('y');
      }

      if (e.key === 'r' && store.selectedCubeId && !store.pickerActive) {
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
      if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedCubeId) {
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
          <Viewport3D />
          {activeMode === 'builder'      && <SelectedCubePanel />}
          {activeMode === 'pataphysical' && <OperatorResultPanel />}
          {activeMode === 'encoding'     && <EncodingResultPanel />}
          <CaptureButton />
          <HelpBar />
        </div>

        {/* BottomSheet contains mode content + MobileTabBar */}
        <BottomSheet>
          {activeMode === 'builder' && <BuilderSidebar />}
          {activeMode === 'pataphysical' && (
            <div className="flex flex-col gap-2.5">
              <MemeInputPanel />
              <CutterTweakPanel />
              <OperatorHistoryList />
            </div>
          )}
          {activeMode === 'encoding'  && <EncodingPanel />}
          {activeMode === 'evolution' && <EvolutionPanel />}
          <ExportPanel />
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
      <div className="absolute inset-0 overflow-hidden [transform:translateZ(0)]">
        <Viewport3D />
        {activeMode === 'builder'      && <SelectedCubePanel />}
        {activeMode === 'pataphysical' && <OperatorResultPanel />}
        {activeMode === 'encoding'     && <EncodingResultPanel />}
        <CaptureButton />
        <HelpBar />
      </div>

      {/* FloatingPanel: glass overlay on the left side */}
      <FloatingPanel
        mode={activeMode}
        isOpen={floatingPanelOpen}
        exportSlot={<ExportPanel />}
      >
        {activeMode === 'builder' && <BuilderSidebar />}
        {activeMode === 'pataphysical' && (
          <div className="flex flex-col gap-2.5">
            <MemeInputPanel />
            <CutterTweakPanel />
            <OperatorHistoryList />
          </div>
        )}
        {activeMode === 'encoding'  && <EncodingPanel />}
        {activeMode === 'evolution' && <EvolutionPanel />}
      </FloatingPanel>
    </div>
  );
};

export default App;
