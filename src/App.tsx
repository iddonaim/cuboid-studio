import React, { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { useBuilderStore } from './store/useBuilderStore';
import { USE_PRECOMPUTED_MODELS, preGenerateAllGeometries } from './lib/cube/csgUtils';
import { getAllRotations, findRotationIndex, AxisRotation } from './lib/cube/connectionRules';
import { ModeSelector } from './components/layout/ModeSelector';
import { MobileBottomSheet } from './components/layout/MobileBottomSheet';
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
  const activeMode = useAppStore(s => s.activeMode);
  const isMobile = useIsMobile();


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

  if (isMobile) {
    return (
      // Use --real-vh (set via JS) instead of 100vh to match the true visible
      // height on iOS Safari — 100vh includes area behind browser chrome.
      // Flex-column layout means the bottom sheet sits at the bottom in normal
      // flow; no position:fixed/absolute needed (avoids WebKit clipping bugs).
      <div className="mobile-root" style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
      }}>
        {/* Viewport area — takes all remaining vertical space.
            transform:translateZ(0) creates a GPU compositing boundary so the
            WebGL canvas cannot visually bleed over the sibling bottom sheet. */}
        <div style={{ flex: '1 1 0', minHeight: 0, position: 'relative', overflow: 'hidden', transform: 'translateZ(0)' }}>
          <Viewport3D />
          {activeMode === 'builder' && <SelectedCubePanel />}
          {activeMode === 'pataphysical' && <OperatorResultPanel />}
          {activeMode === 'encoding' && <EncodingResultPanel />}
          <CaptureButton />
          <HelpBar />
        </div>

        <MobileBottomSheet>
          <ModeSelector />
          {activeMode === 'builder' && <BuilderSidebar />}
          {activeMode === 'pataphysical' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <MemeInputPanel />
              <CutterTweakPanel />
              <OperatorHistoryList />
            </div>
          )}
          {activeMode === 'encoding' && <EncodingPanel />}
          {activeMode === 'evolution' && <EvolutionPanel />}
          <ExportPanel />
        </MobileBottomSheet>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{
        width: 250, minWidth: 250, maxWidth: 250,
        flexShrink: 0,
        position: 'relative',
        background: '#0f172a',
        borderRight: '1px solid #1e293b',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <h1 style={{ color: 'white', fontSize: 18, marginBottom: 8 }}>Cuboid Studio</h1>
        <ModeSelector />

        {activeMode === 'builder' && <BuilderSidebar />}
        {activeMode === 'pataphysical' && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MemeInputPanel />
            <CutterTweakPanel />
            <OperatorHistoryList />
          </div>
        )}
        {activeMode === 'encoding' && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <EncodingPanel />
          </div>
        )}
        {activeMode === 'evolution' && <EvolutionPanel />}

        <ExportPanel />
      </div>

      {/* Canvas area */}
      <div style={{
        flex: 1, flexShrink: 1, flexGrow: 1,
        position: 'relative', minWidth: 0, overflow: 'hidden',
      }}>
        <Viewport3D />

        {activeMode === 'builder' && <SelectedCubePanel />}
        {activeMode === 'pataphysical' && <OperatorResultPanel />}
        {activeMode === 'encoding' && <EncodingResultPanel />}
        <CaptureButton />
        <HelpBar />
      </div>
    </div>
  );
};

export default App;
