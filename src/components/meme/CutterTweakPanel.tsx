import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useMemeStore } from '../../store/useMemeStore';
import type { LLMOperatorResult } from '../../lib/operators/types';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

/** Compact slider row that only fires reapply after user stops dragging */
const TweakSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, onChange }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-slate-400 text-[9px] w-6 flex-shrink-0">{label}</span>
    <Slider
      min={min}
      max={max}
      step={step}
      value={[value]}
      onValueChange={([v]) => onChange(v)}
      className="flex-1"
    />
    <span className="text-slate-500 text-[9px] w-8 text-right">
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

  // Local state for slider values — synced from lastResult when a new translation arrives
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

  // Track operator count to distinguish new translations from tweaks
  const lastOperatorCount = useRef(0);

  useEffect(() => {
    if (!lastResult) return;
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

  // Debounce reapply — wait 150ms after last slider change
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
    <div className="flex flex-col gap-1.5 p-2 bg-slate-800 border border-slate-700 rounded-md">
      <div className="flex items-center gap-1.5">
        <Switch
          checked={cutterVisible}
          onCheckedChange={setCutterVisible}
          id="cutter-visible"
          className="data-[state=checked]:bg-red-500"
        />
        <label htmlFor="cutter-visible" className="text-slate-400 text-[10px] font-semibold cursor-pointer">
          Show cutter — {lastResult.cutter.type}
        </label>
      </div>

      {cutterVisible && (
        <>
          <TweakSlider label="Mag" value={magnitude} min={0.05} max={1} step={0.01}
            onChange={makeHandler(setMagnitude, 'mag')} />

          <div className="text-slate-500 text-[9px] mt-0.5">Position</div>
          <TweakSlider label="X" value={posX} min={-1} max={1} step={0.05}
            onChange={makeHandler(setPosX, 'px')} />
          <TweakSlider label="Y" value={posY} min={-1} max={1} step={0.05}
            onChange={makeHandler(setPosY, 'py')} />
          <TweakSlider label="Z" value={posZ} min={-1} max={1} step={0.05}
            onChange={makeHandler(setPosZ, 'pz')} />

          <div className="text-slate-500 text-[9px] mt-0.5">Proportions</div>
          <TweakSlider label="X" value={propX} min={0.05} max={2} step={0.05}
            onChange={makeHandler(setPropX, 'sx')} />
          <TweakSlider label="Y" value={propY} min={0.05} max={2} step={0.05}
            onChange={makeHandler(setPropY, 'sy')} />
          <TweakSlider label="Z" value={propZ} min={0.05} max={2} step={0.05}
            onChange={makeHandler(setPropZ, 'sz')} />

          <div className="text-slate-500 text-[9px] mt-0.5">Rotation</div>
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
