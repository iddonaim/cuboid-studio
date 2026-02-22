import React from 'react';
import { CUBE_VARIATIONS } from '../../lib/cube/specifications';
import { useBuilderStore } from '../../store/useBuilderStore';
import { CubeThumbnail } from './CubeThumbnail';
import { RulesToggle } from './RulesToggle';
import { StrictRulesToggle } from './StrictRulesToggle';
import { useIsMobile } from '../../hooks/useIsMobile';

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
  const sectionEnabled = useBuilderStore(s => s.sectionEnabled);
  const setSectionEnabled = useBuilderStore(s => s.setSectionEnabled);
  const sectionAxis = useBuilderStore(s => s.sectionAxis);
  const setSectionAxis = useBuilderStore(s => s.setSectionAxis);
  const sectionPosition = useBuilderStore(s => s.sectionPosition);
  const setSectionPosition = useBuilderStore(s => s.setSectionPosition);
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
      <p style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>
        {CUBE_VARIATIONS.length} variations {'\u2022'} {placedCubes.length} placed
        {isGenerating && <span style={{ color: '#fbbf24' }}> {'\u2022'} Generating...</span>}
      </p>

      <RulesToggle enabled={rulesEnabled} onChange={setRulesEnabled} />
      <StrictRulesToggle
        enabled={strictRulesEnabled}
        onChange={setStrictRulesEnabled}
        disabled={!rulesEnabled}
      />

      {/* Install PWA section */}
      <div style={{
        marginBottom: 12,
        padding: 10,
        background: showInstallButton ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#1e293b',
        border: showInstallButton ? '1px solid #1e40af' : '1px solid #334155',
        borderRadius: 6,
      }}>
        {showInstallButton ? (
          <button
            onClick={handleInstallClick}
            style={{
              width: '100%', padding: 0, background: 'transparent', border: 'none',
              color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            Install App
          </button>
        ) : (
          <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: '#cbd5e1' }}>Install as App</div>
            <div style={{ fontSize: 10 }}>
              Chrome: Menu {'\u22EE'} {'\u2192'} <span style={{ color: '#60a5fa' }}>Install Cuboid Studio</span>
            </div>
          </div>
        )}
      </div>

      {/* Variation thumbnail grid */}
      <div style={{
        ...(isMobile
          ? { maxHeight: 200, overflowY: 'auto' }
          : { flex: 1, overflowY: 'auto' }
        ),
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 6,
        padding: 4,
      }}>
        {CUBE_VARIATIONS.map((v, i) => (
          <CubeThumbnail
            key={v.id}
            variation={v}
            selected={selectedIdx === i}
            onClick={() => setSelectedIdx(i)}
          />
        ))}
      </div>

      {/* Undo/Redo buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={undo}
          disabled={historyIndex <= 0}
          style={{
            flex: 1, padding: 8, background: '#1e293b', border: '1px solid #334155',
            borderRadius: 6, color: historyIndex > 0 ? '#94a3b8' : '#475569',
            cursor: historyIndex > 0 ? 'pointer' : 'default', fontSize: 11,
          }}
        >
          Undo
        </button>
        <button
          onClick={redo}
          disabled={historyIndex >= history.length - 1}
          style={{
            flex: 1, padding: 8, background: '#1e293b', border: '1px solid #334155',
            borderRadius: 6, color: historyIndex < history.length - 1 ? '#94a3b8' : '#475569',
            cursor: historyIndex < history.length - 1 ? 'pointer' : 'default', fontSize: 11,
          }}
        >
          Redo
        </button>
      </div>

      {/* Section plane controls */}
      <div style={{ marginTop: 12, borderTop: '1px solid #334155', paddingTop: 12 }}>
        {sectionEnabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['x', 'y', 'z'] as const).map(axis => (
                <button
                  key={axis}
                  onClick={() => setSectionAxis(axis)}
                  style={{
                    flex: 1, padding: 4, fontSize: 11,
                    background: sectionAxis === axis ? '#f59e0b' : '#1e293b',
                    color: sectionAxis === axis ? 'black' : '#94a3b8',
                    border: 'none', borderRadius: 4, cursor: 'pointer',
                  }}
                >
                  {axis.toUpperCase()}
                </button>
              ))}
            </div>
            <input
              type="range"
              min={-100}
              max={200}
              value={sectionPosition}
              onChange={(e) => setSectionPosition(Number(e.target.value))}
              style={{ width: '100%' }}
            />
            <span style={{ color: '#64748b', fontSize: 10, textAlign: 'center' }}>
              {sectionAxis.toUpperCase()} = {sectionPosition}
            </span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={sectionEnabled}
            onChange={(e) => setSectionEnabled(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ color: sectionEnabled ? '#f59e0b' : '#64748b', fontSize: 12 }}>
            Section Cut
          </span>
        </div>
      </div>

      {/* Auto-fill buttons */}
      <div style={{ marginTop: 12, borderTop: '1px solid #334155', paddingTop: 12 }}>
        <p style={{ color: '#64748b', fontSize: 11, marginBottom: 8 }}>
          Grow {selectedCubeId ? 'from selected' : '(random)'}
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          {[5, 10, 25].map(count => (
            <button
              key={count}
              onClick={() => handleAutoFill(count)}
              style={{
                flex: 1, padding: 8, background: '#065f46', border: 'none',
                borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 11,
              }}
            >
              +{count}
            </button>
          ))}
        </div>
      </div>

      {placedCubes.length > 0 && (
        <button
          onClick={handleClearAll}
          style={{
            marginTop: 8, padding: 10, background: '#7f1d1d', border: 'none',
            borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 12, width: '100%',
          }}
        >
          Clear All
        </button>
      )}
    </>
  );
};
