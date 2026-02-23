import React from 'react';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useIsTouch } from '../../hooks/useIsMobile';
import { useAppStore } from '../../store/useAppStore';
import {
  getAllRotations,
  findRotationIndex,
  AxisRotation,
} from '../../lib/cube/connectionRules';

/**
 * Floating action buttons shown on touch devices in builder mode.
 * Provides tap-accessible equivalents for keyboard shortcuts (Space = rotate,
 * R = tip) that don't exist on touch screens.
 */
export const TouchPlacementToolbar: React.FC = () => {
  const isTouch = useIsTouch();
  const activeMode = useAppStore(s => s.activeMode);
  const pickerActive = useBuilderStore(s => s.pickerActive);
  const setPickerActive = useBuilderStore(s => s.setPickerActive);
  const hoverPos = useBuilderStore(s => s.hoverPos);
  const selectedCubeId = useBuilderStore(s => s.selectedCubeId);
  const setSelectedCubeId = useBuilderStore(s => s.setSelectedCubeId);
  const setHoverPos = useBuilderStore(s => s.setHoverPos);
  const setHoverInfo = useBuilderStore(s => s.setHoverInfo);

  if (!isTouch || activeMode !== 'builder') return null;

  const handleRotateY = () => {
    const store = useBuilderStore.getState();
    if (store.pickerActive && store.hoverPos) {
      const validRotations = store.getValidRotations();
      const rotationsToUse = validRotations.length > 0 ? validRotations : getAllRotations();
      store.setPreviewRotation(prev => {
        const currentRotation =
          findRotationIndex(validRotations, prev) === -1 && validRotations.length > 0
            ? validRotations[0]
            : prev;
        const currentIdx = findRotationIndex(rotationsToUse, currentRotation);
        if (currentIdx === -1) return rotationsToUse[0];
        return rotationsToUse[(currentIdx + 1) % rotationsToUse.length];
      });
    } else if (store.selectedCubeId && !store.pickerActive) {
      store.rotateSelectedCube('y');
    }
  };

  const handleTipX = () => {
    const store = useBuilderStore.getState();
    if (store.pickerActive && store.hoverPos) {
      store.setPreviewRotation(prev => ({
        ...prev,
        x: ((prev.x + 1) % 4) as AxisRotation,
      }));
    } else if (store.selectedCubeId && !store.pickerActive) {
      store.rotateSelectedCube('x');
    }
  };

  const handleTogglePicker = () => {
    if (pickerActive) {
      setPickerActive(false);
      setHoverPos(null);
      setHoverInfo(null);
      setSelectedCubeId(null);
    } else {
      setPickerActive(true);
      setSelectedCubeId(null);
    }
  };

  const btnStyle: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    fontSize: 18,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div style={{
      position: 'absolute',
      bottom: 56,
      right: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      zIndex: 20,
    }}>
      {/* Rotate Y (Space equivalent) */}
      <button
        onClick={handleRotateY}
        title="Rotate (Space)"
        style={{
          ...btnStyle,
          background: '#1e293bee',
          color: '#94a3b8',
        }}
      >
        ↻
      </button>

      {/* Tip X (R equivalent) */}
      <button
        onClick={handleTipX}
        title="Tip (R)"
        style={{
          ...btnStyle,
          background: '#1e293bee',
          color: '#94a3b8',
        }}
      >
        ↺
      </button>

      {/* Toggle picker / select mode */}
      <button
        onClick={handleTogglePicker}
        title={pickerActive ? 'Switch to Select mode' : 'Switch to Place mode'}
        style={{
          ...btnStyle,
          background: pickerActive ? '#065f46ee' : '#7c3aedee',
          color: 'white',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        {pickerActive ? '+' : 'S'}
      </button>
    </div>
  );
};
