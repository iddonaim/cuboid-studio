import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useMemeStore } from '../../store/useMemeStore';
import type { LLMOperatorResult, LLMCutterResult } from '../../lib/operators/types';

/** Debounced slider that only fires reapply after user stops dragging */
const TweakSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <span style={{ color: '#94a3b8', fontSize: 9, width: 24, flexShrink: 0 }}>{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{ flex: 1, height: 12 }}
    />
    <span style={{ color: '#64748b', fontSize: 9, width: 32, textAlign: 'right' as const }}>
      {value.toFixed(step < 0.1 ? 2 : 1)}
    </span>
  </div>
);

export const CutterTweakPanel: React.FC = () => {
  const lastResult = useMemeStore(s => s.lastResult);
  const reapplyWithTweaks = useMemeStore(s => s.reapplyWithTweaks);
  const targetCubeId = useMemeStore(s => s.targetCubeId);
  const cubeOperators = useMemeStore(s => s.cubeOperators);
  const standaloneOperators = useMemeStore(s => s.operators);
  const operators = targetCubeId ? (cubeOperators[targetCubeId] || []) : standaloneOperators;
  const cutterVisible = useMemeStore(s => s.cutterVisible);
  const setCutterVisible = useMemeStore(s => s.setCutterVisible);

  // Local state for slider values -- synced from lastResult when it changes from a new translation
  const [magnitude, setMagnitude] = useState(0.5);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [posZ, setPosZ] = useState(0);
  const [propX, setPropX] = useState(1);
  const [propY, setPropY] = useState(1);
  const [propZ, setPropZ] = useState(1);
  const [rotX, setRotX] = useState(0);
  const [rotY, setRotY] = useState(0);
  const [rotZ, setRotZ] = useState(0);

  // Track the operator count so we know when a NEW translation arrives vs a tweak
  const lastOperatorCount = useRef(0);

  useEffect(() => {
    if (!lastResult) return;
    // Only sync sliders when a genuinely new operator was added
    if (operators.length !== lastOperatorCount.current) {
      lastOperatorCount.current = operators.length;
      setMagnitude(lastResult.magnitude);
      setPosX(lastResult.cutter.position[0]);
      setPosY(lastResult.cutter.position[1]);
      setPosZ(lastResult.cutter.position[2]);
      setPropX(lastResult.cutter.proportions[0]);
      setPropY(lastResult.cutter.proportions[1]);
      setPropZ(lastResult.cutter.proportions[2]);
      setRotX(lastResult.cutter.rotation[0]);
      setRotY(lastResult.cutter.rotation[1]);
      setRotZ(lastResult.cutter.rotation[2]);
    }
  }, [lastResult, operators.length]);

  // Debounce reapply -- wait 150ms after last slider change
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const applyTweaks = useCallback((overrides: Partial<{
    mag: number;
    px: number; py: number; pz: number;
    sx: number; sy: number; sz: number;
    rx: number; ry: number; rz: number;
  }>) => {
    if (!lastResult) return;

    const tweaked: LLMOperatorResult = {
      ...lastResult,
      magnitude: overrides.mag ?? magnitude,
      cutter: {
        ...lastResult.cutter,
        position: [overrides.px ?? posX, overrides.py ?? posY, overrides.pz ?? posZ],
        proportions: [overrides.sx ?? propX, overrides.sy ?? propY, overrides.sz ?? propZ],
        rotation: [overrides.rx ?? rotX, overrides.ry ?? rotY, overrides.rz ?? rotZ],
      },
    };

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => reapplyWithTweaks(tweaked), 150);
  }, [lastResult, magnitude, posX, posY, posZ, propX, propY, propZ, rotX, rotY, rotZ, reapplyWithTweaks]);

  if (!lastResult || operators.length === 0) return null;

  const makeHandler = (setter: (v: number) => void, key: string) => (v: number) => {
    setter(v);
    applyTweaks({ [key]: v });
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: 8, background: '#1e293b', borderRadius: 6,
      border: '1px solid #334155',
    }}>
      <label style={{
        display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
      }}>
        <input
          type="checkbox"
          checked={cutterVisible}
          onChange={e => setCutterVisible(e.target.checked)}
          style={{ margin: 0, accentColor: '#ef4444' }}
        />
        <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600 }}>
          Show cutter — {lastResult.cutter.type}
        </span>
      </label>

      {cutterVisible && (
        <>
          {/* Magnitude */}
          <TweakSlider label="Mag" value={magnitude} min={0.05} max={1} step={0.01}
            onChange={makeHandler(setMagnitude, 'mag')} />

          {/* Position */}
          <div style={{ color: '#64748b', fontSize: 9, marginTop: 2 }}>Position</div>
          <TweakSlider label="X" value={posX} min={-1} max={1} step={0.05}
            onChange={makeHandler(setPosX, 'px')} />
          <TweakSlider label="Y" value={posY} min={-1} max={1} step={0.05}
            onChange={makeHandler(setPosY, 'py')} />
          <TweakSlider label="Z" value={posZ} min={-1} max={1} step={0.05}
            onChange={makeHandler(setPosZ, 'pz')} />

          {/* Proportions */}
          <div style={{ color: '#64748b', fontSize: 9, marginTop: 2 }}>Proportions</div>
          <TweakSlider label="X" value={propX} min={0.05} max={2} step={0.05}
            onChange={makeHandler(setPropX, 'sx')} />
          <TweakSlider label="Y" value={propY} min={0.05} max={2} step={0.05}
            onChange={makeHandler(setPropY, 'sy')} />
          <TweakSlider label="Z" value={propZ} min={0.05} max={2} step={0.05}
            onChange={makeHandler(setPropZ, 'sz')} />

          {/* Rotation */}
          <div style={{ color: '#64748b', fontSize: 9, marginTop: 2 }}>Rotation</div>
          <TweakSlider label="X" value={rotX} min={0} max={360} step={5}
            onChange={makeHandler(setRotX, 'rx')} />
          <TweakSlider label="Y" value={rotY} min={0} max={360} step={5}
            onChange={makeHandler(setRotY, 'ry')} />
          <TweakSlider label="Z" value={rotZ} min={0} max={360} step={5}
            onChange={makeHandler(setRotZ, 'rz')} />
        </>
      )}
    </div>
  );
};
